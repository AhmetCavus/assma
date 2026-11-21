import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GrapeMark, Wordmark } from "../components/GrapeMark";
import { SiteFooter } from "../components/SiteFooter";
import { GitHubLink, LocaleSelect, ThemeButton } from "../components/Controls";
import type { Preferences } from "../lib/preferences";
import { linkHandler, navigate } from "../lib/router";
import { setSeed } from "../lib/seed";

/** The recordings in web/public/tour, in the order of the tour copy. */
const TOUR = ["capture", "fit", "cv", "import"] as const;

/** How ripe the grape of each demo scene is: captured, assessed, CV drafted. */
const SCENE_RIPENESS = [0.3, 0.65, 1];

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** A grape that fills from the bottom: a grey cluster with the coloured one clipped above it. */
function Fruit({ ratio, size }: { ratio: number; size: number }) {
  const crop = Math.round((1 - Math.min(1, Math.max(0, ratio))) * 100);
  return (
    <span
      className={`fruit ${ratio >= 1 ? "is-ripe" : ""}`}
      style={{ width: size, height: size, ["--crop" as string]: `${crop}%` }}
      aria-hidden="true"
    >
      <span className="fruit-ghost">
        <GrapeMark size={size} />
      </span>
      <span className="fruit-fill">
        <GrapeMark size={size} />
      </span>
    </span>
  );
}

/** Fills its grape once it scrolls into view, so the three steps ripen as you read. */
function RipeningFruit({ ratio }: { ratio: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = holder.current;
    if (!element || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && setVisible(true),
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={holder} className="phase-fruit">
      <Fruit ratio={visible ? ratio : 0} size={68} />
    </div>
  );
}

type Stage = "listening" | "thinking" | "answering" | "idle";

/**
 * A scripted miniature of the workspace: the visitor asks, assma reads, the project card
 * moves on and its grape ripens. It plays by itself and every question can be picked.
 */
function LiveDemo({ preferences }: { preferences: Preferences }) {
  const { demo } = preferences.copy.landing;
  const reduced = useMemo(reducedMotion, []);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("listening");
  const [heard, setHeard] = useState(0);
  const [said, setSaid] = useState(0);
  const scene = demo.scenes[index] ?? demo.scenes[0]!;
  const answered = stage === "answering" || stage === "idle";
  // Until assma has answered, the card still shows the state before this question.
  const shown = answered ? scene : (demo.scenes[index - 1] ?? scene);
  const ratio = answered ? SCENE_RIPENESS[index]! : index > 0 ? SCENE_RIPENESS[index - 1]! : 0.1;

  const play = (next: number) => {
    setIndex(next % demo.scenes.length);
    setHeard(0);
    setSaid(0);
    setStage("listening");
  };

  useEffect(() => {
    let delay: number;
    let advance: () => void;
    if (stage === "listening") {
      const done = heard >= scene.say.length;
      delay = done ? 600 : 38;
      advance = done
        ? () => setStage("thinking")
        : () => setHeard(reduced ? scene.say.length : heard + 1);
    } else if (stage === "thinking") {
      delay = reduced ? 300 : 1200;
      advance = () => setStage("answering");
    } else if (stage === "answering") {
      const done = said >= scene.reply.length;
      delay = done ? 0 : 18;
      advance = done
        ? () => setStage("idle")
        : () => setSaid(reduced ? scene.reply.length : said + 2);
    } else {
      delay = reduced ? 10000 : 5200;
      advance = () => play(index + 1);
    }
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
    // `play` only reads the scene count, which never changes while the page is open.
  }, [heard, index, reduced, said, scene, stage]);

  return (
    <div className="showcase" role="group" aria-label={demo.label}>
      <div className="project-preview" aria-hidden="true">
        <Fruit ratio={ratio} size={76} />
        <div>
          <span className="tag" key={shown.badge}>
            {shown.badge}
          </span>
          <h2>{demo.title}</h2>
          <p className="meta">{shown.meta}</p>
        </div>
        <div className="next">
          <span className="tiny">{demo.nextStep}</span>
          <strong key={shown.step}>{shown.step}</strong>
        </div>
      </div>

      <div className={`dialogue is-${stage}`} aria-hidden="true">
        <span className="orb">
          <GrapeMark size={34} />
        </span>
        <div>
          <p className="said">
            <b>{demo.you}</b> {scene.say.slice(0, heard)}
            {stage === "listening" && <i className="caret" />}
          </p>
          {answered && <span className="tag good">✓ {scene.action}</span>}
          <p className="reply">
            {stage === "thinking" ? (
              <>
                {demo.thinking}
                <span className="typing" />
              </>
            ) : (
              scene.reply.slice(0, said)
            )}
          </p>
        </div>
      </div>

      <div className="picker">
        <p className="hint">{demo.caption}</p>
        <div className="chip-list">
          {demo.scenes.map((entry, position) => (
            <button
              key={entry.say}
              type="button"
              className="chip"
              aria-pressed={position === index}
              onClick={() => play(position)}
            >
              {preferences.locale === "de" ? `„${entry.say}“` : `“${entry.say}”`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const ICONS = {
  chip: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 5h4v4h-4z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h6",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z",
  server:
    "M5 4h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 9h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm3-5.5h.01M8 16.5h.01",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2 2 4-4",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
} as const;

function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** One recording of the tour; people who prefer less motion see its still frame. */
function TourShot({ name, alt }: { name: string; alt: string }) {
  return (
    <figure className="tour-shot">
      <div className="window-bar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet={`/tour/${name}.png`} />
        <img
          src={`/tour/${name}.gif`}
          alt={alt}
          width={960}
          height={600}
          loading="lazy"
          decoding="async"
        />
      </picture>
    </figure>
  );
}

function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`landing-section ${className}`}>
      {children}
    </section>
  );
}

export function LandingPage({
  preferences,
  signedIn,
}: {
  preferences: Preferences;
  signedIn: boolean;
}) {
  const { copy } = preferences;
  const { landing } = copy;
  const workspace = signedIn ? "/dashboard" : "/login";
  const [brief, setBrief] = useState("");

  const seed = (event: FormEvent) => {
    event.preventDefault();
    setSeed(brief);
    navigate(signedIn ? "/projects/new" : "/signup");
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <a href="/" className="home-link" onClick={linkHandler("/")}>
          <Wordmark />
        </a>
        <nav className="header-actions" aria-label={copy.common.language}>
          <GitHubLink preferences={preferences} />
          <LocaleSelect preferences={preferences} />
          <ThemeButton preferences={preferences} />
          <a className="pill" href={workspace} onClick={linkHandler(workspace)}>
            {signedIn ? landing.openWorkspace : landing.login}
          </a>
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{landing.eyebrow}</p>
            <h1>
              <span>{landing.titleLead}</span>
              <span>{landing.titleNext}</span> <em>{landing.titleAccent}</em>
            </h1>
            <p className="lead">{landing.lead}</p>
            <div className="hero-actions">
              {signedIn ? (
                <a className="button large" href="/dashboard" onClick={linkHandler("/dashboard")}>
                  {landing.openWorkspace}
                </a>
              ) : (
                <>
                  <a className="button large" href="/signup" onClick={linkHandler("/signup")}>
                    {landing.signup}
                  </a>
                  <a className="pill large" href="/login" onClick={linkHandler("/login")}>
                    {landing.login}
                  </a>
                </>
              )}
            </div>
            <a className="tour-link" href="#tour">
              {landing.tourLink} <Icon name="arrow" size={16} />
            </a>
          </div>
          <LiveDemo preferences={preferences} />
        </section>

        <Section className="how">
          <h2 className="section-title">{landing.stepsTitle}</h2>
          <ol className="phases">
            {landing.steps.map((step, index) => (
              <li key={step.title}>
                <RipeningFruit ratio={[0.25, 0.6, 1][index] ?? 1} />
                <h3>
                  <b>{index + 1}.</b> {step.title}
                </h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <ul className="proof">
            {landing.facts.map((fact, index) => (
              <li key={fact}>
                <Icon
                  name={(["chip", "lock", "file", "globe"] as const)[index] ?? "chip"}
                  size={16}
                />
                {fact}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="tour" className="tour">
          <p className="eyebrow">{landing.tour.eyebrow}</p>
          <h2 className="section-title">{landing.tour.title}</h2>
          <p className="section-lead">{landing.tour.lead}</p>
          <ol className="tour-list">
            {landing.tour.items.map((item, index) => (
              <li key={item.title} className="tour-item">
                <div className="tour-text">
                  <span className="tour-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <TourShot name={TOUR[index] ?? "capture"} alt={item.alt} />
              </li>
            ))}
          </ol>
        </Section>

        <Section className="privacy">
          <p className="eyebrow">{landing.privacy.eyebrow}</p>
          <h2 className="section-title">{landing.privacy.title}</h2>
          <ul className="privacy-grid">
            {landing.privacy.items.map((item, index) => (
              <li key={item.title}>
                <span className="privacy-icon">
                  <Icon
                    name={(["server", "shield", "download"] as const)[index] ?? "server"}
                    size={22}
                  />
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
          <div className="next-card">
            <h3>{landing.next.title}</h3>
            <ul>
              {landing.next.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Section>

        <Section className="seed">
          <Fruit ratio={1} size={64} />
          <h2 className="section-title">{landing.seed.title}</h2>
          <p>{landing.seed.lead}</p>
          <form onSubmit={seed}>
            <input
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={landing.seed.placeholder}
              aria-label={landing.seed.placeholder}
              maxLength={16000}
            />
            <button className="button">{landing.seed.action}</button>
          </form>
        </Section>
      </main>

      <SiteFooter preferences={preferences} />
    </div>
  );
}
