import { LocaleSelect, ThemeButton } from "../components/Controls";
import { Wordmark } from "../components/GrapeMark";
import { SiteFooter } from "../components/SiteFooter";
import { operator, operatorConfigured, type LegalPageName } from "../lib/legal";
import type { Preferences } from "../lib/preferences";
import { linkHandler } from "../lib/router";

function Imprint({ preferences }: { preferences: Preferences }) {
  const text = preferences.copy.legal.imprint;
  return (
    <>
      {operatorConfigured ? (
        <>
          <section>
            <h2>{text.operator}</h2>
            <address>
              <strong>{operator.name}</strong>
              {operator.address.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
            {operator.representative && (
              <p>
                {text.representative}: {operator.representative}
              </p>
            )}
          </section>
          <section>
            <h2>{text.contact}</h2>
            <p>
              {text.email}: <a href={`mailto:${operator.email}`}>{operator.email}</a>
            </p>
            {operator.phone && (
              <p>
                {text.phone}: {operator.phone}
              </p>
            )}
          </section>
          {(operator.register || operator.vatId) && (
            <section>
              <h2>{text.register}</h2>
              {operator.register && <p>{operator.register}</p>}
              {operator.vatId && (
                <p>
                  {text.vat}: {operator.vatId}
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        <p className="alert" role="note">
          {text.missing}
        </p>
      )}
      <section>
        <h2>{text.aboutTitle}</h2>
        <p>{text.about}</p>
      </section>
    </>
  );
}

/** Data privacy, terms and imprint. Reachable signed in or out, from every footer. */
export function LegalPage({
  page,
  preferences,
}: {
  page: LegalPageName;
  preferences: Preferences;
}) {
  const { copy } = preferences;
  const text = copy.legal[page];
  return (
    <div className="legal">
      <header className="legal-top">
        <a href="/" className="home-link" onClick={linkHandler("/")} aria-label={copy.legal.back}>
          <Wordmark />
        </a>
        <div className="header-actions">
          <LocaleSelect preferences={preferences} />
          <ThemeButton preferences={preferences} />
        </div>
      </header>
      <main className="legal-body">
        <a className="back-link" href="/" onClick={linkHandler("/")}>
          ← {copy.legal.back}
        </a>
        <h1>{text.title}</h1>
        <p className="legal-lead">{text.lead}</p>
        {page === "imprint" ? (
          <Imprint preferences={preferences} />
        ) : (
          copy.legal[page].sections.map((section, index) => (
            <section key={section.title}>
              <h2>
                <span>{index + 1}</span>
                {section.title}
              </h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))
        )}
        <p className="legal-updated">{copy.legal.updated}</p>
      </main>
      <SiteFooter preferences={preferences} />
    </div>
  );
}
