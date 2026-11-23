import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  ASSISTANT_LIMITS,
  localIntent,
  takeSentences,
  toApiError,
  type AssistantAction,
  type AssistantContext as PageContext,
  type AssistantJob,
  type AssistantService,
  type AssistantTurn,
  type AssistantView,
  type NavigationTarget,
} from "@assma/shared";
import type { Preferences } from "./preferences";
import { navigate } from "./router";
import type { Session } from "./session";
import { useSpeaker, useVoiceInput, type VoiceInputError } from "./voice";

/** What a page lets the assistant do. Each handler uses the page's own state and API. */
export type AssistantHandlers = {
  /** Return false when the text stayed the same, so no new version is made. */
  revise_email: (next: { subject: string; message: string }) => boolean;
  revise_summary: (summary: string) => boolean;
  assess_fit: () => void | Promise<void>;
  add_note: (text: string) => void | Promise<void>;
};

export type PageRegistration = {
  context?: PageContext;
  services: Partial<AssistantHandlers>;
};

export type AssistantPhase = "idle" | "listening" | "thinking" | "answering" | "speaking";

/** The latest question and its answer. Older turns live in the history. */
export type Exchange = {
  question: string;
  reply: string;
  pending: boolean;
  /** Queue position while waiting for the model. */
  position: number;
  /** What the assistant did, for the confirmation chip. */
  done: Exclude<AssistantAction["kind"], "none"> | null;
  unexpected: string[];
  problem: string;
  /** A neutral remark, for example that the text stayed the same. */
  notice: string;
};

type Assistant = {
  phase: AssistantPhase;
  exchange: Exchange | null;
  history: AssistantTurn[];
  view: AssistantView & { page: NonNullable<AssistantView["page"]> };
  services: AssistantService[];
  interim: string;
  voiceProblem: VoiceInputError;
  voiceSupported: boolean;
  speakerSupported: boolean;
  speakReplies: boolean;
  writing: boolean;
  send: (text: string, viaVoice?: boolean) => Promise<void>;
  talk: () => void;
  stop: () => void;
  dismiss: () => void;
  clear: () => void;
  toggleSpeak: () => void;
  setWriting: (on: boolean) => void;
  register: (registration: MutableRefObject<PageRegistration>, services: string) => () => void;
};

const AssistantContext = createContext<Assistant | null>(null);

const ID = "([a-f0-9]{24})";
const PROJECT_PAGE = new RegExp(`^/projects/${ID}(?:/(cv|apply|edit))?/?$`, "i");
const APPLICATION_PAGE = new RegExp(`^/applications/${ID}/?$`, "i");

/** What is on screen, from the address alone. */
export function viewOf(path: string): Assistant["view"] {
  const project = PROJECT_PAGE.exec(path);
  if (project) {
    const sub = (project[2] ?? "").toLowerCase() as "" | "cv" | "apply" | "edit";
    return { page: sub || "project", projectId: project[1]!, applicationId: null };
  }
  const application = APPLICATION_PAGE.exec(path);
  if (application) {
    return { page: "application", projectId: null, applicationId: application[1]! };
  }
  const page =
    path === "/projects/new"
      ? "new_project"
      : path.startsWith("/projects")
        ? "projects"
        : path === "/experience/import"
          ? "import"
          : path.startsWith("/experience")
            ? "experience"
            : "dashboard";
  return { page, projectId: null, applicationId: null };
}

function pathOf(target: NavigationTarget, view: Assistant["view"]): string | null {
  const project = view.projectId;
  switch (target) {
    case "dashboard":
      return "/dashboard";
    case "projects":
      return "/projects";
    case "new_project":
      return "/projects/new";
    case "experience":
      return "/experience";
    case "import":
      return "/experience/import";
    case "project":
      return project ? `/projects/${project}` : null;
    case "project_cv":
      return project ? `/projects/${project}/cv` : null;
    case "project_apply":
      return project ? `/projects/${project}/apply` : null;
  }
}

const HISTORY_KEY = "assma.assistant.history";
const SPEAK_KEY = "assma.assistant.speak";

function readStorage(storage: "session" | "local", key: string): string | null {
  try {
    return (storage === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: "session" | "local", key: string, value: string | null) {
  try {
    const target = storage === "session" ? window.sessionStorage : window.localStorage;
    if (value === null) {
      target.removeItem(key);
    } else {
      target.setItem(key, value);
    }
  } catch {
    // Only a convenience.
  }
}

function restoreHistory(): AssistantTurn[] {
  try {
    const parsed = JSON.parse(readStorage("session", HISTORY_KEY) ?? "[]") as AssistantTurn[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

const isEditable = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      "input, textarea, select, button, a, summary, [role='button'], [contenteditable='true']",
    ),
  );

/**
 * The assistant above every signed-in page: it listens, answers, knows which page is open
 * and carries out that page's services. Pages offer services through `useAssistantPage`.
 * The conversation stays in this browser tab (session storage), never on the server.
 */
export function AssistantProvider({
  session,
  preferences,
  path,
  children,
}: {
  session: Session;
  preferences: Preferences;
  path: string;
  children: ReactNode;
}) {
  const { copy, locale, toggleTheme } = preferences;
  const text = copy.assistant;
  const speechLocale = locale === "de" ? "de-DE" : "en-GB";
  const view = useMemo(() => viewOf(path), [path]);
  const [history, setHistory] = useState<AssistantTurn[]>(restoreHistory);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [writing, setWriting] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(() => readStorage("local", SPEAK_KEY) === "on");
  const [services, setServices] = useState<AssistantService[]>([]);
  const page = useRef<MutableRefObject<PageRegistration> | null>(null);
  const job = useRef<{ id: string; cancelled: boolean } | null>(null);
  const spoken = useRef("");
  const spaceHeldSince = useRef(0);
  const sendRef = useRef<Assistant["send"]>(async () => {});
  const speaker = useSpeaker(speechLocale);
  const voice = useVoiceInput(speechLocale, (transcript) => void sendRef.current(transcript, true));

  useEffect(() => {
    writeStorage("session", HISTORY_KEY, JSON.stringify(history.slice(-40)));
  }, [history]);

  const register = useCallback(
    (registration: MutableRefObject<PageRegistration>, names: string) => {
      page.current = registration;
      setServices(names ? (names.split(",") as AssistantService[]) : []);
      return () => {
        if (page.current === registration) {
          page.current = null;
          setServices([]);
        }
      };
    },
    [],
  );

  const settle = (patch: Partial<Exchange>) =>
    setExchange((current) => current && { ...current, ...patch });

  /** Carries out what the model chose, through the page's own handlers. */
  const act = useCallback(
    async (action: AssistantAction): Promise<boolean> => {
      const handlers = page.current?.current.services ?? {};
      switch (action.kind) {
        case "none":
          return false;
        case "navigate": {
          const target = pathOf(action.target, view);
          if (target) {
            navigate(target);
          }
          return Boolean(target);
        }
        case "revise_email":
          return (
            handlers.revise_email?.({ subject: action.subject, message: action.message }) ?? false
          );
        case "revise_summary":
          return handlers.revise_summary?.(action.summary) ?? false;
        case "assess_fit":
          await handlers.assess_fit?.();
          return Boolean(handlers.assess_fit);
        case "add_note":
          await handlers.add_note?.(action.text);
          return Boolean(handlers.add_note);
      }
    },
    [view],
  );

  const speakPart = (reply: string, aloud: boolean, final: boolean) => {
    if (!aloud) {
      return;
    }
    const fresh = reply.slice(spoken.current.length);
    if (!fresh) {
      return;
    }
    const { sentences, rest } = takeSentences(fresh);
    sentences.forEach(speaker.say);
    spoken.current = reply.slice(0, reply.length - rest.length);
    if (final && rest.trim()) {
      speaker.say(rest);
      spoken.current = reply;
    }
  };

  const send = useCallback(
    async (raw: string, viaVoice = false) => {
      const message = raw.trim().slice(0, ASSISTANT_LIMITS.message);
      if (!message || job.current) {
        return;
      }
      // A typed conversation goes on in the open field; speaking closes it.
      if (viaVoice) {
        setWriting(false);
      }
      speaker.cancel();
      spoken.current = "";
      const aloud = speakReplies || viaVoice;
      const start: Exchange = {
        question: message,
        reply: "",
        pending: true,
        position: 0,
        done: null,
        unexpected: [],
        problem: "",
        notice: "",
      };

      const intent = localIntent(message);
      if (intent) {
        let reply = "";
        if (intent.kind === "navigate") {
          const target = pathOf(intent.target, view);
          if (target) {
            navigate(target);
            reply = text.opened(text.targets[intent.target]);
          }
        } else if (intent.kind === "theme") {
          toggleTheme();
          reply = text.theme;
        } else {
          setHistory([]);
          reply = text.cleared;
        }
        if (reply) {
          setExchange({ ...start, reply, pending: false });
          if (aloud) {
            speaker.say(reply);
          }
          return;
        }
      }

      setExchange(start);
      const registration = page.current?.current;
      const offered = (Object.keys(registration?.services ?? {}) as AssistantService[]).filter(
        (name) => registration?.services[name],
      );
      let current: AssistantJob;
      try {
        current = await session.api.askAssistant({
          message,
          locale,
          voice: viaVoice,
          view,
          services: offered,
          context: registration?.context ?? {},
          history: history.slice(-ASSISTANT_LIMITS.history).map((turn) => ({
            ...turn,
            content: turn.content.slice(0, ASSISTANT_LIMITS.historyText),
          })),
        });
      } catch (failure) {
        const error = toApiError(failure);
        if (error.isUnauthorized) {
          session.signOut(copy.common.sessionExpired);
          return;
        }
        settle({
          pending: false,
          problem:
            error.code === "too_many_attempts"
              ? text.errors.tooMany
              : error.isNetwork
                ? text.errors.offline
                : text.errors.unavailable,
        });
        return;
      }

      const handle = { id: current.id, cancelled: false };
      job.current = handle;
      try {
        while (current.state === "queued" || current.state === "reading") {
          await new Promise((resolve) => window.setTimeout(resolve, current.partial ? 450 : 800));
          if (handle.cancelled) {
            return;
          }
          current = await session.api.assistantJob(handle.id);
          if (handle.cancelled) {
            return;
          }
          settle({ reply: current.partial, position: current.position });
          speakPart(current.partial, aloud, false);
        }
        if (current.state === "failed" || !current.answer) {
          settle({
            pending: false,
            problem:
              current.error === "timeout"
                ? text.errors.timeout
                : current.error === "model_unavailable"
                  ? text.errors.unavailable
                  : text.errors.failed,
          });
          return;
        }
        const { reply, action } = current.answer;
        let done: Exchange["done"] = null;
        let problem = "";
        let notice = "";
        try {
          if (action.kind !== "none" && (await act(action))) {
            done = action.kind;
          } else if (action.kind === "revise_email" || action.kind === "revise_summary") {
            notice = text.unchanged;
          }
        } catch (failure) {
          if (toApiError(failure).isUnauthorized) {
            session.signOut(copy.common.sessionExpired);
            return;
          }
          problem = text.errors.action;
        }
        const unexpected =
          done && (action.kind === "revise_email" || action.kind === "revise_summary")
            ? action.unexpected
            : [];
        const finalReply = reply || (done ? text.done[done] : "");
        settle({ reply: finalReply, pending: false, done, unexpected, problem, notice });
        speakPart(finalReply, aloud, true);
        setHistory((previous) => [
          ...previous,
          { role: "user", content: message },
          ...(finalReply ? [{ role: "assistant" as const, content: finalReply }] : []),
        ]);
      } catch (failure) {
        if (handle.cancelled) {
          return;
        }
        const error = toApiError(failure);
        if (error.isUnauthorized) {
          session.signOut(copy.common.sessionExpired);
          return;
        }
        settle({
          pending: false,
          problem: error.isNetwork ? text.errors.offline : text.errors.failed,
        });
      } finally {
        if (job.current === handle) {
          job.current = null;
        }
      }
    },
    [act, copy, history, locale, session, speakReplies, speaker, text, toggleTheme, view],
  );
  sendRef.current = send;

  const stop = useCallback(() => {
    const running = job.current;
    if (running) {
      running.cancelled = true;
      job.current = null;
      void session.api.cancelAssistant(running.id).catch(() => undefined);
      setExchange((current) => (current?.pending ? null : current));
    }
    speaker.cancel();
    voice.stop();
  }, [session.api, speaker, voice]);

  const talk = useCallback(() => {
    speaker.cancel();
    if (voice.listening) {
      voice.stop();
    } else if (!job.current) {
      setWriting(false);
      voice.start();
    }
  }, [speaker, voice]);

  const toggleSpeak = useCallback(() => {
    setSpeakReplies((previous) => {
      writeStorage("local", SPEAK_KEY, previous ? null : "on");
      if (previous) {
        speaker.cancel();
      }
      return !previous;
    });
  }, [speaker]);

  // A finished answer steps aside after a while, unless it asks something.
  useEffect(() => {
    if (!exchange || exchange.pending || speaker.speaking || voice.listening) {
      return;
    }
    if (exchange.reply.trim().endsWith("?") || exchange.unexpected.length > 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setExchange(null),
      Math.min(40_000, 10_000 + exchange.reply.length * 60),
    );
    return () => window.clearTimeout(timer);
  }, [exchange, speaker.speaking, voice.listening]);

  // Keys that reach the assistant from anywhere; Esc silences it before the page reacts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        talk();
        return;
      }
      if (event.key === "Escape") {
        const busy = job.current || speaker.speaking || voice.listening;
        if (busy || writing || exchange) {
          event.preventDefault();
          event.stopPropagation();
          stop();
          setWriting(false);
          if (!busy) {
            setExchange(null);
          }
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) {
        return;
      }
      if (event.code === "Space") {
        // Space belongs to the assistant outside fields; without this the page would scroll.
        event.preventDefault();
        if (!event.repeat && !voice.listening && !job.current) {
          spaceHeldSince.current = Date.now();
          speaker.cancel();
          voice.start();
        }
      } else if (event.key === "/") {
        event.preventDefault();
        setWriting(true);
      } else if (event.key.toLowerCase() === "v" && speaker.supported && !event.shiftKey) {
        event.preventDefault();
        toggleSpeak();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !spaceHeldSince.current) {
        return;
      }
      const held = Date.now() - spaceHeldSince.current;
      spaceHeldSince.current = 0;
      // A quick tap keeps listening until a pause; a real hold ends on release.
      if (held > 400) {
        voice.stop();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  });

  // Leaving the app's workspace ends a running answer.
  useEffect(
    () => () => {
      const running = job.current;
      if (running) {
        running.cancelled = true;
        void session.api.cancelAssistant(running.id).catch(() => undefined);
      }
    },
    [session.api],
  );

  const phase: AssistantPhase = voice.listening
    ? "listening"
    : exchange?.pending
      ? exchange.reply
        ? "answering"
        : "thinking"
      : speaker.speaking
        ? "speaking"
        : "idle";

  const value: Assistant = {
    phase,
    exchange,
    history,
    view,
    services,
    interim: voice.interim,
    voiceProblem: voice.error,
    voiceSupported: voice.supported,
    speakerSupported: speaker.supported,
    speakReplies,
    writing,
    send,
    talk,
    stop,
    dismiss: () => setExchange(null),
    clear: () => {
      setHistory([]);
      setExchange(null);
    },
    toggleSpeak,
    setWriting,
    register,
  };

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): Assistant {
  const value = useContext(AssistantContext);
  if (!value) {
    throw new Error("useAssistant must be used inside AssistantProvider.");
  }
  return value;
}

/**
 * Lets the open page offer its services and unsaved text to the assistant. Handlers always
 * see the page's latest state; the set of services is re-announced when it changes.
 */
export function useAssistantPage(registration: PageRegistration): void {
  const assistant = useContext(AssistantContext);
  const latest = useRef(registration);
  latest.current = registration;
  const names = Object.keys(registration.services)
    .filter((key) => registration.services[key as AssistantService])
    .sort()
    .join(",");
  const register = assistant?.register;
  useEffect(() => register?.(latest, names), [register, names]);
}
