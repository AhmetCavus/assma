import { useState } from "react";
import { toApiError } from "@assma/shared";
import { setFlash } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";
import { ReferenceForm } from "./ExperiencePage";

/** A new reference on its own page, like the CV import: one task, nothing else around it. */
export function ReferenceNewPage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy } = preferences;
  const text = copy.experience;
  const { api, signOut } = session;
  const [error, setError] = useState("");

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    setError(apiError.code === "reference_limit" ? text.referenceLimit : copy.common.error);
  }

  return (
    <div className="page reference-new">
      <a className="link" href="/experience" onClick={linkHandler("/experience")}>
        ← {copy.cvImport.back}
      </a>
      <h1>{text.newReference}</h1>
      <p className="lead">{text.newReferenceLead}</p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <section className="card">
        <ReferenceForm
          title={text.newReference}
          showTitle={false}
          copy={copy}
          onSave={async (input) => {
            await api.createReference(input);
            setFlash(text.referenceAdded(input.organization));
            navigate("/experience");
          }}
          onCancel={() => navigate("/experience")}
          onFailure={fail}
        />
      </section>
    </div>
  );
}
