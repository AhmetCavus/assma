import { useEffect, useRef, useState } from "react";
import { ELLMA_URL, LEGAL_PAGES, legalPath, YAPPAI_URL, type LegalPageName } from "../lib/legal";
import type { Preferences } from "../lib/preferences";
import { linkHandler } from "../lib/router";
import { GITHUB_URL } from "./Controls";
import { Wordmark } from "./GrapeMark";

/** "Cookie settings": what assma keeps in the browser. Everything is necessary, nothing tracks. */
function StorageDialog({
  preferences,
  onClose,
}: {
  preferences: Preferences;
  onClose: () => void;
}) {
  const text = preferences.copy.legal.storage;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
    }
  }, []);
  return (
    <dialog
      ref={dialog}
      className="data-dialog"
      aria-labelledby="storage-title"
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
    >
      <h2 id="storage-title">{text.title}</h2>
      <p>{text.lead}</p>
      <div className="storage-row">
        <div>
          <strong>{text.necessaryTitle}</strong>
          <p>{text.necessaryText}</p>
        </div>
        <span className="storage-state">{text.alwaysOn}</span>
      </div>
      <div className="storage-row">
        <div>
          <strong>{text.trackingTitle}</strong>
          <p>{text.trackingText}</p>
        </div>
        <span className="storage-state">{text.never}</span>
      </div>
      <form method="dialog">
        <button className="button">{text.close}</button>
      </form>
    </dialog>
  );
}

/**
 * Legal links, the storage ("cookie") settings and the yappai credit, as in ellma. The full
 * form closes the public pages; the compact one sits in the workspace sidebar.
 */
export function SiteFooter({
  preferences,
  compact = false,
}: {
  preferences: Preferences;
  compact?: boolean;
}) {
  const { copy } = preferences;
  const text = copy.legal.footer;
  const [settings, setSettings] = useState(false);

  const link = (page: LegalPageName) => (
    <a href={legalPath(page)} onClick={linkHandler(legalPath(page))}>
      {text[page]}
    </a>
  );
  const [privacy, terms, imprint] = LEGAL_PAGES;

  return (
    <footer className={compact ? "site-foot is-compact" : "site-foot"}>
      {!compact && (
        <>
          <a href="/" className="home-link" onClick={linkHandler("/")}>
            <Wordmark />
          </a>
          <p>{copy.landing.footer.tagline}</p>
        </>
      )}
      {/* Not a <nav> element: inside the sidebar it would inherit the main navigation styles. */}
      <div className="foot-links" role="navigation" aria-label={text.label}>
        {link(privacy)}
        {link(terms)}
        <button type="button" className="link-button" onClick={() => setSettings(true)}>
          {text.cookies}
        </button>
        {link(imprint)}
      </div>
      <div className="foot-links">
        {!compact && (
          <>
            <a
              href={ELLMA_URL}
              target="_blank"
              rel="noopener"
              title={copy.landing.footer.ellmaHint}
            >
              ellma
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener">
              {text.sourceCode}
            </a>
          </>
        )}
        <a className="powered-by" href={YAPPAI_URL} target="_blank" rel="noopener">
          {text.poweredBy} <strong>yappai</strong>
        </a>
      </div>
      {settings && <StorageDialog preferences={preferences} onClose={() => setSettings(false)} />}
    </footer>
  );
}
