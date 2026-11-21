import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  formatPeriod,
  LANGUAGE_LEVELS,
  parseSkills,
  sortEducation,
  profileInputSchema,
  referenceInputSchema,
  referenceLabel,
  sortReferences,
  toApiError,
  type Copy,
  type Experience,
  type ExperienceProfile,
  type ExperienceReference,
  type LanguageLevel,
  type ProfileImage,
  type ReferenceInput,
} from "@assma/shared";
import type { ZodError } from "zod";
import { takeFlash } from "../lib/flash";
import { preparePhoto } from "../lib/photo";
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
    invalid_phone: copy.invalidPhone,
    invalid_url: copy.invalidUrl,
    invalid_year: copy.invalidYear,
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

  async function uploadPhotos(files: File[]) {
    setError("");
    setStatus("");
    for (const file of files) {
      let data: string;
      try {
        data = await preparePhoto(file);
      } catch {
        setError(text.photoInvalid);
        continue;
      }
      try {
        const image = await api.uploadImage({ data });
        setExperience((current) => current && { ...current, images: [...current.images, image] });
        setStatus(text.photoUploaded);
      } catch (failure) {
        const code = toApiError(failure).code;
        if (code === "image_limit") {
          setError(text.photoLimit);
          return;
        }
        if (code === "invalid_image" || code === "invalid_input") {
          setError(text.photoInvalid);
          continue;
        }
        fail(failure);
        return;
      }
    }
  }

  async function deletePhoto(image: ProfileImage) {
    if (!window.confirm(text.confirmDeletePhoto)) {
      return;
    }
    try {
      await api.deleteImage(image.id);
      setExperience(
        (current) =>
          current && { ...current, images: current.images.filter((item) => item.id !== image.id) },
      );
      setStatus(text.photoDeleted);
    } catch (failure) {
      fail(failure);
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

          <div className="side-column">
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
            <PhotosCard
              images={experience.images}
              copy={copy}
              onUpload={uploadPhotos}
              onDelete={deletePhoto}
            />
          </div>
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
  const details = [
    profile.headline,
    profile.location,
    profile.address,
    profile.phone,
    profile.email,
    profile.website,
  ].filter(Boolean);
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
      {profile.certificates.length > 0 && (
        <>
          <h3 className="profile-subtitle">{text.certificatesTitle}</h3>
          <ul className="profile-list">
            {profile.certificates.map((certificate) => (
              <li key={certificate.name}>
                {certificate.name}
                {(certificate.issuer || certificate.year) && (
                  <span className="muted">
                    {" "}
                    · {[certificate.issuer, certificate.year].filter(Boolean).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {profile.languages.length > 0 && (
        <>
          <h3 className="profile-subtitle">{text.languagesTitle}</h3>
          <ul className="profile-list">
            {profile.languages.map((language) => (
              <li key={language.name}>
                {language.name} <span className="muted">· {text.levels[language.level]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {profile.education.length > 0 && (
        <>
          <h3 className="profile-subtitle">{text.educationTitle}</h3>
          <ul className="profile-list">
            {sortEducation(profile.education).map((entry) => (
              <li key={`${entry.degree}-${entry.institution}`}>
                {entry.degree}
                <span className="muted">
                  {" "}
                  ·{" "}
                  {[entry.institution, [entry.start, entry.end].filter(Boolean).join("–")]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {profile.hobbies.length > 0 && (
        <>
          <h3 className="profile-subtitle">{text.hobbies}</h3>
          <p className="muted">{profile.hobbies.join(" · ")}</p>
        </>
      )}
      <button type="button" className="pill wide" onClick={onEdit}>
        <PencilIcon />
        {text.editProfile}
      </button>
    </>
  );
}

type CertificateRow = { name: string; issuer: string; year: string };
type LanguageRow = { name: string; level: LanguageLevel };
type EducationRow = {
  degree: string;
  institution: string;
  start: string;
  end: string;
  note: string;
};

/** Updates one field of one row in a list of rows. */
function rowSetter<T>(set: (update: (rows: T[]) => T[]) => void) {
  return (index: number, field: keyof T) => (event: { target: { value: string } }) =>
    set((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, [field]: event.target.value } : row,
      ),
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
  const [hobbies, setHobbies] = useState(initial.hobbies.join(", "));
  const [certificates, setCertificates] = useState<CertificateRow[]>(initial.certificates);
  const [languages, setLanguages] = useState<LanguageRow[]>(initial.languages);
  const [education, setEducation] = useState<EducationRow[]>(initial.education);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (field: keyof ExperienceProfile) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));
  const setCertificate =
    (index: number, field: keyof CertificateRow) => (event: { target: { value: string } }) =>
      setCertificates((current) =>
        current.map((row, position) =>
          position === index ? { ...row, [field]: event.target.value } : row,
        ),
      );

  async function submit() {
    const parsed = profileInputSchema.safeParse({
      ...values,
      hobbies: parseSkills(hobbies),
      // Rows left completely empty are dropped instead of failing validation.
      certificates: certificates.filter(
        (row) => row.name.trim() || row.issuer.trim() || row.year.trim(),
      ),
      languages: languages.filter((row) => row.name.trim()),
      education: education.filter(
        (row) =>
          row.degree.trim() || row.institution.trim() || row.start || row.end || row.note.trim(),
      ),
    });
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
        <input
          value={values.name}
          onChange={set("name")}
          maxLength={80}
          autoFocus
          autoComplete="name"
        />
      </Field>
      <Field label={text.headline} hint={text.headlineHint} error={errors.headline}>
        <input value={values.headline} onChange={set("headline")} maxLength={80} />
      </Field>
      <Field label={text.location} error={errors.location}>
        <input value={values.location} onChange={set("location")} maxLength={80} />
      </Field>
      <Field label={text.address} hint={text.addressHint} error={errors.address}>
        <textarea
          value={values.address}
          onChange={set("address")}
          maxLength={200}
          rows={2}
          autoComplete="street-address"
        />
      </Field>
      <div className="form-row">
        <Field label={text.phone} error={errors.phone}>
          <input
            type="tel"
            value={values.phone}
            onChange={set("phone")}
            maxLength={40}
            autoComplete="tel"
          />
        </Field>
        <Field label={text.email} error={errors.email}>
          <input
            type="email"
            value={values.email}
            onChange={set("email")}
            maxLength={254}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="email"
          />
        </Field>
      </div>
      <Field label={text.website} error={errors.website}>
        <input
          value={values.website}
          onChange={set("website")}
          maxLength={200}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://"
        />
      </Field>
      <Field label={text.summary} hint={text.summaryHint} error={errors.summary}>
        <textarea value={values.summary} onChange={set("summary")} maxLength={800} rows={4} />
      </Field>
      <fieldset className="certificate-rows">
        <legend>{text.certificatesTitle}</legend>
        {certificates.map((row, index) => (
          <div key={index} className="certificate-row">
            <input
              aria-label={text.certificateName}
              placeholder={text.certificateName}
              value={row.name}
              onChange={setCertificate(index, "name")}
              maxLength={120}
            />
            <input
              aria-label={text.certificateIssuer}
              placeholder={text.certificateIssuer}
              value={row.issuer}
              onChange={setCertificate(index, "issuer")}
              maxLength={120}
            />
            <input
              aria-label={text.certificateYear}
              placeholder={text.certificateYear}
              value={row.year}
              onChange={setCertificate(index, "year")}
              inputMode="numeric"
              maxLength={4}
            />
            <button
              type="button"
              className="icon-button small-button"
              onClick={() =>
                setCertificates((current) => current.filter((_, position) => position !== index))
              }
              aria-label={text.removeCertificate(row.name)}
              title={text.removeCertificate(row.name)}
            >
              ×
            </button>
          </div>
        ))}
        {errors.certificates && (
          <small className="field-error" role="alert">
            {errors.certificates}
          </small>
        )}
        <button
          type="button"
          className="pill"
          onClick={() =>
            setCertificates((current) => [...current, { name: "", issuer: "", year: "" }])
          }
          disabled={certificates.length >= 30}
        >
          <span aria-hidden="true">+</span>
          {text.addCertificate}
        </button>
      </fieldset>
      <fieldset className="certificate-rows">
        <legend>{text.languagesTitle}</legend>
        {languages.map((row, index) => (
          <div key={index} className="language-row">
            <input
              aria-label={text.languageName}
              placeholder={text.languageName}
              value={row.name}
              onChange={rowSetter(setLanguages)(index, "name")}
              maxLength={60}
            />
            <select
              aria-label={text.languageLevel}
              value={row.level}
              onChange={rowSetter(setLanguages)(index, "level")}
            >
              {LANGUAGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {text.levels[level]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button small-button"
              onClick={() =>
                setLanguages((current) => current.filter((_, position) => position !== index))
              }
              aria-label={text.removeLanguage(row.name)}
              title={text.removeLanguage(row.name)}
            >
              ×
            </button>
          </div>
        ))}
        {errors.languages && (
          <small className="field-error" role="alert">
            {errors.languages}
          </small>
        )}
        <button
          type="button"
          className="pill"
          onClick={() => setLanguages((current) => [...current, { name: "", level: "B2" }])}
          disabled={languages.length >= 12}
        >
          <span aria-hidden="true">+</span>
          {text.addLanguage}
        </button>
      </fieldset>
      <fieldset className="certificate-rows">
        <legend>{text.educationTitle}</legend>
        {education.map((row, index) => (
          <div key={index} className="education-row">
            <input
              aria-label={text.degree}
              placeholder={text.degree}
              value={row.degree}
              onChange={rowSetter(setEducation)(index, "degree")}
              maxLength={120}
            />
            <input
              aria-label={text.institution}
              placeholder={text.institution}
              value={row.institution}
              onChange={rowSetter(setEducation)(index, "institution")}
              maxLength={120}
            />
            <input
              aria-label={text.educationStart}
              placeholder={text.educationStart}
              value={row.start}
              onChange={rowSetter(setEducation)(index, "start")}
              inputMode="numeric"
              maxLength={4}
            />
            <input
              aria-label={text.educationEnd}
              placeholder={text.educationEnd}
              value={row.end}
              onChange={rowSetter(setEducation)(index, "end")}
              inputMode="numeric"
              maxLength={4}
            />
            <input
              className="education-note"
              aria-label={text.educationNote}
              placeholder={text.educationNote}
              value={row.note}
              onChange={rowSetter(setEducation)(index, "note")}
              maxLength={200}
            />
            <button
              type="button"
              className="icon-button small-button"
              onClick={() =>
                setEducation((current) => current.filter((_, position) => position !== index))
              }
              aria-label={text.removeEducation(row.degree)}
              title={text.removeEducation(row.degree)}
            >
              ×
            </button>
          </div>
        ))}
        {errors.education && (
          <small className="field-error" role="alert">
            {errors.education}
          </small>
        )}
        <button
          type="button"
          className="pill"
          onClick={() =>
            setEducation((current) => [
              ...current,
              { degree: "", institution: "", start: "", end: "", note: "" },
            ])
          }
          disabled={education.length >= 12}
        >
          <span aria-hidden="true">+</span>
          {text.addEducation}
        </button>
      </fieldset>
      <Field label={text.hobbies} hint={text.hobbiesHint} error={errors.hobbies}>
        <input value={hobbies} onChange={(event) => setHobbies(event.target.value)} />
      </Field>
      <FormActions busy={busy} copy={copy} onCancel={onCancel} />
    </form>
  );
}

function PhotosCard({
  images,
  copy,
  onUpload,
  onDelete,
}: {
  images: ProfileImage[];
  copy: Copy;
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (image: ProfileImage) => Promise<void>;
}) {
  const text = copy.experience;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const full = images.length >= 6;
  return (
    <section className="card" aria-labelledby="photos-title">
      <h2 id="photos-title">{text.photosTitle}</h2>
      <p className="muted small">{text.photosLead}</p>
      {images.length > 0 && (
        <ul className="photo-grid">
          {images.map((image, index) => (
            <li key={image.id}>
              <img src={image.dataUrl} alt={text.photoAlt(index + 1)} />
              <button
                type="button"
                className="icon-button small-button photo-delete"
                onClick={() => void onDelete(image)}
                aria-label={`${text.deletePhoto} ${index + 1}`}
                title={text.deletePhoto}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="pill"
        disabled={busy || full}
        onClick={() => input.current?.click()}
      >
        <span aria-hidden="true">+</span>
        {busy ? text.uploading : text.uploadPhoto}
      </button>
      {full && <p className="muted small">{text.photoLimit}</p>}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) {
            setBusy(true);
            void onUpload(files).finally(() => setBusy(false));
          }
        }}
      />
    </section>
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
