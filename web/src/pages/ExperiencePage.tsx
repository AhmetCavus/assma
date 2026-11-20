import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  formatPeriod,
  parseSkills,
  profileInputSchema,
  referenceInputSchema,
  referenceLabel,
  sortReferences,
  toApiError,
  type Copy,
  type Experience,
  type ExperienceProfile,
  type ExperienceReference,
  type ReferenceInput,
} from "@assma/shared";
import type { ZodError } from "zod";
import { takeFlash } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

type FieldErrors = Record<string, string>;
type Editing = { kind: "profile" } | { kind: "reference"; id: string | null } | null;

/** Turns the shared schema's issue codes into the visible message for each field. */
export function fieldErrors(error: ZodError, copy: Copy["experience"]): FieldErrors {
  const messages: Record<string, string> = {
    required: copy.required,
    invalid_email: copy.invalidEmail,
    invalid_month: copy.invalidMonth,
    end_before_start: copy.endBeforeStart,
    too_many: copy.tooManySkills,
  };
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    result[field] ??= messages[issue.message] ?? copy.required;
  }
  return result;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label>
      {label}
      {children}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : (
        hint && <small className="muted">{hint}</small>
      )}
    </label>
  );
}

export function ExperiencePage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.experience;
  const { api, signOut } = session;
  const [experience, setExperience] = useState<Experience | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(takeFlash);

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    if (apiError.code === "not_found") {
      setEditing(null);
      setError(text.notFound);
      void load();
      return;
    }
    setError(apiError.code === "reference_limit" ? text.referenceLimit : copy.common.error);
  }

  async function load() {
    try {
      setExperience(await api.experience());
    } catch (failure) {
      fail(failure);
    }
  }

  useEffect(() => {
    void load();
    // `api` is stable for the session.
  }, [api]);

  function startEditing(next: Editing) {
    setError("");
    setStatus("");
    setEditing(next);
  }

  function finished(message: string, next: Experience) {
    setExperience(next);
    setEditing(null);
    setError("");
    setStatus(message);
  }

  async function saveProfile(input: ExperienceProfile) {
    const profile = await api.saveProfile(input);
    if (experience) {
      finished(text.saved, { ...experience, profile });
    }
  }

  async function saveReference(id: string | null, input: ReferenceInput) {
    const saved = id ? await api.updateReference(id, input) : await api.createReference(input);
    if (experience) {
      const others = experience.references.filter((reference) => reference.id !== saved.id);
      finished(text.saved, { ...experience, references: sortReferences([...others, saved]) });
    }
  }

  async function removeReference(reference: ExperienceReference) {
    if (!window.confirm(text.confirmDelete(reference.organization))) {
      return;
    }
    try {
      await api.deleteReference(reference.id);
      if (experience) {
        finished(text.deleted, {
          ...experience,
          references: experience.references.filter((item) => item.id !== reference.id),
        });
      }
    } catch (failure) {
      fail(failure);
    }
  }

  const period = (reference: ExperienceReference) =>
    formatPeriod(reference.start, reference.end, locale, text.today);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{text.title}</h1>
          <p className="lead">{text.lead}</p>
        </div>
        <a className="button" href="/experience/import" onClick={linkHandler("/experience/import")}>
          <UploadIcon />
          {text.importCv}
        </a>
      </div>
      <p className="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!experience ? (
        !error && <p className="muted">{copy.common.loading}</p>
      ) : (
        <div className="experience-grid">
          <section className="card" aria-labelledby="references-title">
            <h2 id="references-title">{text.referencesTitle}</h2>
            {experience.references.length === 0 && editing?.kind !== "reference" && (
              <p className="muted">{text.referencesEmpty}</p>
            )}
            <ol className="reference-list">
              {experience.references.map((reference, index) =>
                editing?.kind === "reference" && editing.id === reference.id ? (
                  <li key={reference.id} className="reference">
                    <ReferenceForm
                      title={text.editReference(referenceLabel(index))}
                      initial={{ ...reference, ongoing: reference.end === null }}
                      copy={copy}
                      onSave={(input) => saveReference(reference.id, input)}
                      onCancel={() => setEditing(null)}
                      onDelete={() => void removeReference(reference)}
                      onFailure={fail}
                    />
                  </li>
                ) : (
                  <li key={reference.id} className="reference">
                    <h3>
                      <span className="badge">{referenceLabel(index)}</span>
                      {reference.organization}
                    </h3>
                    <p className="muted reference-meta">
                      {reference.role} · {period(reference)}
                    </p>
                    <p className="reference-body">{reference.contribution}</p>
                    <div className="reference-footer">
                      <span className="muted">{reference.skills.join(" · ")}</span>
                      <button
                        type="button"
                        className="pill"
                        onClick={() => startEditing({ kind: "reference", id: reference.id })}
                        aria-label={`${text.edit}: ${reference.organization}`}
                      >
                        <PencilIcon />
                        {text.edit}
                      </button>
                    </div>
                  </li>
                ),
              )}
              {editing?.kind === "reference" && editing.id === null && (
                <li className="reference">
                  <ReferenceForm
                    title={text.newReference}
                    copy={copy}
                    onSave={(input) => saveReference(null, input)}
                    onCancel={() => setEditing(null)}
                    onFailure={fail}
                  />
                </li>
              )}
            </ol>
            {editing?.kind !== "reference" && (
              <button
                type="button"
                className="pill"
                onClick={() => startEditing({ kind: "reference", id: null })}
              >
                <span aria-hidden="true">+</span>
                {text.addReference}
              </button>
            )}
          </section>

          <section className="card" aria-labelledby="profile-title">
            <h2 id="profile-title">{text.profileTitle}</h2>
            {editing?.kind === "profile" ? (
              <ProfileForm
                initial={experience.profile}
                copy={copy}
                onSave={saveProfile}
                onCancel={() => setEditing(null)}
                onFailure={fail}
              />
            ) : (
              <ProfileSummary
                profile={experience.profile}
                copy={copy}
                onEdit={() => startEditing({ kind: "profile" })}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ProfileSummary({
  profile,
  copy,
  onEdit,
}: {
  profile: ExperienceProfile;
  copy: Copy;
  onEdit: () => void;
}) {
  const text = copy.experience;
  const details = [profile.headline, profile.location, profile.email].filter(Boolean);
  return (
    <>
      {profile.name && <p className="profile-name">{profile.name}</p>}
      {details.length > 0 && (
        <p className="profile-details">
          {details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
        </p>
      )}
      {profile.summary ? (
        <p className="muted profile-summary">{profile.summary}</p>
      ) : (
        <p className="muted">{text.profileEmpty}</p>
      )}
      <button type="button" className="pill wide" onClick={onEdit}>
        <PencilIcon />
        {text.editProfile}
      </button>
    </>
  );
}

function ProfileForm({
  initial,
  copy,
  onSave,
  onCancel,
  onFailure,
}: {
  initial: ExperienceProfile;
  copy: Copy;
  onSave: (input: ExperienceProfile) => Promise<void>;
  onCancel: () => void;
  onFailure: (failure: unknown) => void;
}) {
  const text = copy.experience;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (field: keyof ExperienceProfile) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function submit() {
    const parsed = profileInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, text));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSave({ ...parsed.data, updatedAt: initial.updatedAt });
    } catch (failure) {
      onFailure(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="form compact"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={text.name} error={errors.name}>
        <input value={values.name} onChange={set("name")} maxLength={80} autoFocus />
      </Field>
      <Field label={text.headline} hint={text.headlineHint} error={errors.headline}>
        <input value={values.headline} onChange={set("headline")} maxLength={80} />
      </Field>
      <Field label={text.location} error={errors.location}>
        <input value={values.location} onChange={set("location")} maxLength={80} />
      </Field>
      <Field label={text.email} error={errors.email}>
        <input
          type="email"
          value={values.email}
          onChange={set("email")}
          maxLength={254}
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label={text.summary} hint={text.summaryHint} error={errors.summary}>
        <textarea value={values.summary} onChange={set("summary")} maxLength={800} rows={4} />
      </Field>
      <FormActions busy={busy} copy={copy} onCancel={onCancel} />
    </form>
  );
}

type ReferenceDraft = {
  organization: string;
  role: string;
  start: string;
  end: string;
  ongoing: boolean;
  contribution: string;
  skills: string;
};

/** What the reference form starts from: a saved reference or a suggestion from a CV. */
export type ReferenceFormInitial = {
  organization: string;
  role: string;
  start: string | null;
  end: string | null;
  ongoing: boolean;
  contribution: string;
  skills: string[];
};

export function ReferenceForm({
  title,
  initial,
  copy,
  onSave,
  onCancel,
  onDelete,
  onFailure,
}: {
  title: string;
  initial?: ReferenceFormInitial;
  copy: Copy;
  onSave: (input: ReferenceInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  onFailure: (failure: unknown) => void;
}) {
  const text = copy.experience;
  const [values, setValues] = useState<ReferenceDraft>({
    organization: initial?.organization ?? "",
    role: initial?.role ?? "",
    start: initial?.start ?? "",
    end: initial?.end ?? "",
    ongoing: initial?.ongoing ?? false,
    contribution: initial?.contribution ?? "",
    skills: initial?.skills.join(", ") ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const set =
    (field: Exclude<keyof ReferenceDraft, "ongoing">) => (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  async function submit() {
    const parsed = referenceInputSchema.safeParse({
      organization: values.organization,
      role: values.role,
      start: values.start,
      end: values.ongoing ? null : values.end,
      contribution: values.contribution,
      skills: parseSkills(values.skills),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, text));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSave(parsed.data);
    } catch (failure) {
      onFailure(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="form compact"
      noValidate
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3>{title}</h3>
      <Field label={text.organization} error={errors.organization}>
        <input
          value={values.organization}
          onChange={set("organization")}
          maxLength={120}
          autoFocus
        />
      </Field>
      <Field label={text.role} error={errors.role}>
        <input value={values.role} onChange={set("role")} maxLength={120} />
      </Field>
      <div className="form-row">
        <Field label={text.start} error={errors.start}>
          <input type="month" value={values.start} onChange={set("start")} placeholder="2023-01" />
        </Field>
        <Field label={text.end} error={errors.end}>
          <input
            type="month"
            value={values.ongoing ? "" : values.end}
            onChange={set("end")}
            disabled={values.ongoing}
            placeholder="2025-12"
          />
        </Field>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={values.ongoing}
          onChange={(event) =>
            setValues((current) => ({ ...current, ongoing: event.target.checked }))
          }
        />
        {text.ongoing}
      </label>
      <Field label={text.contribution} hint={text.contributionHint} error={errors.contribution}>
        <textarea
          value={values.contribution}
          onChange={set("contribution")}
          maxLength={1500}
          rows={3}
        />
      </Field>
      <Field label={text.skills} hint={text.skillsHint} error={errors.skills}>
        <input value={values.skills} onChange={set("skills")} />
      </Field>
      <FormActions busy={busy} copy={copy} onCancel={onCancel} onDelete={onDelete} />
    </form>
  );
}

function FormActions({
  busy,
  copy,
  onCancel,
  onDelete,
}: {
  busy: boolean;
  copy: Copy;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const text = copy.experience;
  return (
    <div className="form-actions">
      <button className="button" disabled={busy}>
        {busy ? copy.common.working : text.save}
      </button>
      <button type="button" className="pill" onClick={onCancel} disabled={busy}>
        {text.cancel}
      </button>
      {onDelete && (
        <button type="button" className="link danger" onClick={onDelete} disabled={busy}>
          {text.delete}
        </button>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
