import { useEffect, useRef, type ReactNode } from "react";
import { useAssistant } from "../lib/assistant";
import type { Preferences } from "../lib/preferences";

function Row({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <div className="guide-row">
      <dt>
        {keys.map((key) => (
          <kbd key={key}>{key}</kbd>
        ))}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** All keyboard shortcuts in one dialog; opened with "?" or the keyboard button. */
export function ShortcutGuide({ preferences }: { preferences: Preferences }) {
  const { copy } = preferences;
  const text = copy.assistant.guide;
  const keys = copy.assistant.keys;
  const assistant = useAssistant();
  const dialog = useRef<HTMLDialogElement>(null);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (assistant.guide && !element.open) {
      element.showModal();
    } else if (!assistant.guide && element.open) {
      element.close();
    }
  }, [assistant.guide]);

  return (
    <dialog
      ref={dialog}
      className="guide"
      aria-labelledby="guide-title"
      onClose={() => {
        assistant.setGuide(false);
        // Keys work again at once: focus must not stay on the closed dialog's button.
        if (dialog.current?.contains(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
      }}
      onClick={(event) => {
        // A click on the backdrop closes the guide.
        if (event.target === event.currentTarget) {
          assistant.setGuide(false);
        }
      }}
    >
      <div className="guide-head">
        <h2 id="guide-title">{text.title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={text.close}
          title={text.close}
          onClick={() => assistant.setGuide(false)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>
      <div className="guide-columns">
        <section>
          <h3>{text.assistant}</h3>
          <dl>
            {assistant.voiceSupported && <Row keys={[keys.space]}>{text.space}</Row>}
            <Row keys={[mac ? "⌘ J" : preferences.locale === "de" ? "Strg J" : "Ctrl J"]}>
              {text.talk}
            </Row>
            <Row keys={["/"]}>{text.write}</Row>
            {assistant.speakerSupported && <Row keys={["V"]}>{text.speak}</Row>}
            <Row keys={["Esc"]}>{text.escape}</Row>
          </dl>
          <h3>{text.acquisition}</h3>
          <dl>
            <Row keys={["N"]}>{text.newProject}</Row>
            <Row keys={["F"]}>{text.fit}</Row>
            <Row keys={["C"]}>{text.cv}</Row>
          </dl>
        </section>
        <section>
          <h3>{text.navigate}</h3>
          <dl>
            <Row keys={["1"]}>{text.page(copy.nav.dashboard)}</Row>
            <Row keys={["2"]}>{text.page(copy.nav.projects)}</Row>
            <Row keys={["3"]}>{text.page(copy.nav.experience)}</Row>
            <Row keys={["4"]}>{text.page(copy.nav.progress)}</Row>
            <Row keys={["?"]}>{text.guide}</Row>
            <Row keys={["D"]}>{text.theme}</Row>
          </dl>
        </section>
      </div>
      <p className="muted small">{text.field}</p>
      <p className="muted small">{text.footnote}</p>
    </dialog>
  );
}

/** Opens the keyboard guide; for the sidebar controls. */
export function ShortcutButton({ preferences }: { preferences: Preferences }) {
  const assistant = useAssistant();
  const label = preferences.copy.assistant.guide.title;
  return (
    <button
      type="button"
      className="icon-button shortcut-button"
      aria-label={label}
      title={`${label} (?)`}
      onClick={() => assistant.setGuide(true)}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" strokeLinecap="round" />
      </svg>
    </button>
  );
}
