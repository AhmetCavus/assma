import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ASSISTANT_LIMITS } from "@assma/shared";
import { useAssistant } from "../lib/assistant";
import type { Preferences } from "../lib/preferences";
import { GrapeMark } from "./GrapeMark";

const PATHS = {
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 18v3",
  stop: "M7 7h10v10H7z",
  send: "M5 12h13M13 6l6 6-6 6",
  speaker: "M4 9v6h4l5 4V5L8 9H4Zm12.5-1a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14",
  speakerOff: "M4 9v6h4l5 4V5L8 9H4Zm13 1 4 4m0-4-4 4",
  trash: "M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  chat: "M5 5h14v10H9l-4 4V5Z",
  close: "M6 6l12 12M18 6 6 18",
  down: "m6 9 6 6 6-6",
  check: "m5 12 5 5 9-10",
} as const;

function Icon({ name, size = 18 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

const TUCK_KEY = "assma.assistant.tucked";

function readTucked(): boolean {
  try {
    return window.localStorage.getItem(TUCK_KEY) === "yes";
  } catch {
    return false;
  }
}

function History({ preferences, onClose }: { preferences: Preferences; onClose: () => void }) {
  const text = preferences.copy.assistant;
  const assistant = useAssistant();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [assistant.history.length]);
  return (
    <section className="dock-history" aria-label={text.history}>
      <header>
        <h2>{text.history}</h2>
        <button
          type="button"
          className="icon-button"
          disabled={assistant.history.length === 0}
          onClick={assistant.clear}
          aria-label={text.clear}
          title={text.clear}
        >
          <Icon name="trash" />
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label={text.close}>
          <Icon name="close" />
        </button>
      </header>
      <div className="dock-history-list" ref={list}>
        {assistant.history.length === 0 && <p className="muted small">{text.historyEmpty}</p>}
        {assistant.history.map((turn, index) => (
          <div key={index} className={`bubble bubble-${turn.role}`}>
            {turn.content}
          </div>
        ))}
      </div>
      <p className="muted small">{text.note}</p>
    </section>
  );
}

/**
 * assma's place on every signed-in page: the grape to talk to, what it says, a field to
 * write in and the services of the open page as suggestions.
 */
export function AssmaDock({ preferences }: { preferences: Preferences }) {
  const text = preferences.copy.assistant;
  const assistant = useAssistant();
  const { phase, exchange, view } = assistant;
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tucked, setTucked] = useState(readTucked);
  const [slow, setSlow] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  /** Position while stepping through earlier inputs with the arrow keys; null is the draft. */
  const [recall, setRecall] = useState<number | null>(null);
  const draft = useRef("");
  const listening = phase === "listening";
  const busy = phase === "thinking" || phase === "answering";

  useEffect(() => {
    setSlow(false);
    if (phase !== "thinking") {
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (assistant.writing) {
      setTuckedStored(false);
      // A kept draft continues where it ended.
      const element = field.current;
      element?.focus();
      element?.setSelectionRange(element.value.length, element.value.length);
    }
  }, [assistant.writing]);

  const setTuckedStored = (next: boolean) => {
    try {
      if (next) {
        window.localStorage.setItem(TUCK_KEY, "yes");
      } else {
        window.localStorage.removeItem(TUCK_KEY);
      }
    } catch {
      // Only a convenience.
    }
    setTucked(next);
  };

  const engaged = listening || busy || Boolean(exchange) || assistant.writing || historyOpen;
  const compact = tucked && !engaged;

  const onOrb = () => {
    if (compact) {
      setTuckedStored(false);
    } else if (busy || phase === "speaking") {
      assistant.stop();
    } else {
      assistant.talk();
    }
  };

  // The field grows with its text, up to a few lines, then scrolls.
  useLayoutEffect(() => {
    const element = field.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
  }, [input, assistant.writing]);

  const asked = assistant.history
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);

  const sendInput = () => {
    const value = input.trim();
    // While an answer is running, the text stays in the field instead of getting lost.
    if (!value || busy) {
      return;
    }
    void assistant.send(value);
    setInput("");
    setRecall(null);
    draft.current = "";
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendInput();
  };

  const showRecalled = (index: number | null) => {
    setRecall(index);
    const value = index === null ? draft.current : (asked[index] ?? "");
    setInput(value);
    // The caret goes to the end, as in a terminal.
    window.requestAnimationFrame(() => {
      field.current?.setSelectionRange(value.length, value.length);
    });
  };

  /**
   * Enter sends, Shift+Enter starts a new line, Ctrl/⌘+Enter also sends. Arrow up on the
   * first line recalls earlier inputs, arrow down on the last line goes forward again.
   */
  const onFieldKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    const element = event.currentTarget;
    // On touch keyboards Enter writes a new line, as in most chat apps; the button sends.
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || (!event.shiftKey && !touch))) {
      event.preventDefault();
      sendInput();
      return;
    }
    if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey || asked.length === 0) {
      return;
    }
    const caret = element.selectionStart;
    const collapsed = caret === element.selectionEnd;
    if (event.key === "ArrowUp" && collapsed && !input.slice(0, caret).includes("\n")) {
      const next = recall === null ? asked.length - 1 : recall - 1;
      if (next >= 0) {
        event.preventDefault();
        if (recall === null) {
          draft.current = input;
        }
        showRecalled(next);
      }
    } else if (
      event.key === "ArrowDown" &&
      collapsed &&
      recall !== null &&
      !input.slice(caret).includes("\n")
    ) {
      event.preventDefault();
      showRecalled(recall + 1 < asked.length ? recall + 1 : null);
    }
  };

  const left = ASSISTANT_LIMITS.message - input.length;

  const voiceProblem = assistant.voiceProblem ? text.voice[assistant.voiceProblem] : "";

  let line;
  if (listening) {
    line = (
      <div className="dock-line" key="listening">
        <p className="dock-heard">{assistant.interim || text.listening}</p>
        <p className="muted small">{text.listeningHint}</p>
      </div>
    );
  } else if (exchange) {
    line = (
      <div className="dock-line" key="exchange">
        <p className="dock-you">
          <span>{text.you}</span> {exchange.question}
        </p>
        {exchange.done && (
          <p className="dock-done">
            <Icon name="check" size={14} /> {text.done[exchange.done]}
          </p>
        )}
        <p className="dock-reply" aria-live="polite">
          {exchange.reply ||
            (exchange.pending &&
              (exchange.position > 0
                ? text.queued(exchange.position)
                : slow
                  ? text.thinkingSlow
                  : text.thinking))}
          {exchange.pending && <span className="typing" aria-hidden="true" />}
        </p>
        {exchange.unexpected.length > 0 && (
          <div className="dock-warning" role="alert">
            <p>{text.unexpected}</p>
            <ul>
              {exchange.unexpected.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        {exchange.notice && <p className="dock-notice">{exchange.notice}</p>}
        {exchange.problem && (
          <p className="dock-problem" role="alert">
            {exchange.problem}
          </p>
        )}
      </div>
    );
  } else {
    line = (
      <div className="dock-line" key={`greeting-${view.page}`}>
        <p className="dock-reply">{text.greetings[view.page]}</p>
      </div>
    );
  }

  return (
    <aside
      className={`dock dock-${phase} ${compact ? "dock-compact" : ""}`}
      aria-label={text.label}
    >
      {historyOpen && <History preferences={preferences} onClose={() => setHistoryOpen(false)} />}
      <div className="dock-bar">
        <button
          type="button"
          className="orb"
          onClick={onOrb}
          aria-pressed={listening}
          aria-label={
            compact
              ? text.expand
              : listening
                ? text.stopListening
                : busy || phase === "speaking"
                  ? text.stop
                  : text.talk
          }
          title={compact ? text.expand : `${listening ? text.stopListening : text.talk} (⌘/Ctrl J)`}
        >
          <GrapeMark size={compact ? 26 : 32} />
        </button>
        {!compact && (
          <>
            <div className="dock-body">
              {voiceProblem && (
                <p className="dock-problem" role="alert">
                  {voiceProblem}
                </p>
              )}
              {line}
              {assistant.writing && (
                <form className="dock-form" onSubmit={submit}>
                  <div className="dock-field">
                    <textarea
                      ref={field}
                      rows={1}
                      autoFocus
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value);
                        setRecall(null);
                      }}
                      onKeyDown={onFieldKey}
                      placeholder={text.placeholder}
                      aria-label={text.write}
                      aria-describedby="dock-field-keys"
                      maxLength={ASSISTANT_LIMITS.message}
                    />
                    <button
                      className="button small"
                      disabled={!input.trim() || busy}
                      aria-label={text.send}
                      title={`${text.send} (Enter)`}
                    >
                      <Icon name="send" />
                    </button>
                  </div>
                  <p className="dock-field-keys" id="dock-field-keys">
                    <span>
                      <kbd>Enter</kbd> {text.input.send}
                    </span>
                    <span>
                      <kbd>Shift</kbd>+<kbd>Enter</kbd> {text.input.newline}
                    </span>
                    {asked.length > 0 && (
                      <span>
                        <kbd>↑</kbd> {text.input.recall}
                      </span>
                    )}
                    <span>
                      <kbd>Esc</kbd> {text.input.close}
                    </span>
                    {left <= 150 && (
                      <span
                        className={`dock-count ${left <= 0 ? "is-full" : ""}`}
                        aria-live="polite"
                      >
                        {text.input.left(left)}
                      </span>
                    )}
                  </p>
                </form>
              )}
            </div>
            <div className="dock-tools">
              {exchange && !exchange.pending && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={assistant.dismiss}
                  aria-label={text.dismiss}
                  title={`${text.dismiss} (Esc)`}
                >
                  <Icon name="close" />
                </button>
              )}
              {assistant.voiceSupported && (
                <button
                  type="button"
                  className={`icon-button ${listening ? "is-on" : ""}`}
                  onClick={assistant.talk}
                  disabled={busy}
                  aria-pressed={listening}
                  aria-label={listening ? text.stopListening : text.talk}
                  title={`${listening ? text.stopListening : text.talk} (⌘/Ctrl J)`}
                >
                  <Icon name={listening ? "stop" : "mic"} />
                </button>
              )}
              <button
                type="button"
                className={`icon-button ${assistant.writing ? "is-on" : ""}`}
                onClick={() => assistant.setWriting(!assistant.writing)}
                aria-pressed={assistant.writing}
                aria-label={text.write}
                title={`${text.write} (/)`}
              >
                <Icon name="keyboard" />
              </button>
              {assistant.speakerSupported && (
                <button
                  type="button"
                  className={`icon-button ${assistant.speakReplies ? "is-on" : ""}`}
                  onClick={assistant.toggleSpeak}
                  aria-pressed={assistant.speakReplies}
                  aria-label={assistant.speakReplies ? text.speakOff : text.speakOn}
                  title={`${assistant.speakReplies ? text.speakOff : text.speakOn} (V)`}
                >
                  <Icon name={assistant.speakReplies ? "speaker" : "speakerOff"} />
                </button>
              )}
              <button
                type="button"
                className={`icon-button ${historyOpen ? "is-on" : ""}`}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-expanded={historyOpen}
                aria-label={text.history}
                title={text.history}
              >
                <Icon name="chat" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setHistoryOpen(false);
                  assistant.dismiss();
                  assistant.setWriting(false);
                  setTuckedStored(true);
                }}
                aria-label={text.minimize}
                title={text.minimize}
              >
                <Icon name="down" />
              </button>
            </div>
          </>
        )}
      </div>
      {!compact && !listening && !busy && (
        <div className="dock-hints">
          {!assistant.writing && (
            <span className="dock-keys">
              {assistant.voiceSupported && (
                <span>
                  <kbd>{text.keys.space}</kbd> {text.keys.talk}
                </span>
              )}
              <span>
                <kbd>/</kbd> {text.keys.write}
              </span>
              {assistant.speakerSupported && (
                <span>
                  <kbd>V</kbd> {text.keys.speak}
                </span>
              )}
              <button type="button" className="dock-guide" onClick={() => assistant.setGuide(true)}>
                <kbd>?</kbd> {text.keys.all}
              </button>
            </span>
          )}
          <span className="dock-chips">
            {text.suggestions[view.page].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip small"
                onClick={() => void assistant.send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </span>
        </div>
      )}
    </aside>
  );
}
