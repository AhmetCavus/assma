import { useState, type ReactNode } from "react";
import {
  FORMAL_STATES,
  referenceLabel,
  sortReferences,
  TECHNICAL_STATES,
  type AssessmentSummary,
  type AssessmentView,
  type Cite,
  type ClarifyAction,
  type CorrectionInput,
  type Evidence,
  type EvidenceItem,
  type EvidenceSuggestion,
  type Experience,
  type FormalItem,
  type FormalState,
  type Requirement,
  type StoredAssessment,
  type TechnicalItem,
  type TechnicalState,
} from "@assma/shared";
import type { Preferences } from "../lib/preferences";
import { linkHandler } from "../lib/router";

type Copy = Preferences["copy"]["assessment"];
type Tone = "good" | "warn" | "bad" | "neutral";

const TECHNICAL_TONE: Record<TechnicalState, Tone> = {
  direct: "good",
  transferable: "good",
  partial: "warn",
  gap: "bad",
  unknown: "neutral",
};
const FORMAL_TONE: Record<FormalState, Tone> = {
  fulfilled: "good",
  unverified: "warn",
  not_fulfilled: "bad",
  not_applicable: "neutral",
};
const EVIDENCE_TONE = {
  full: "good",
  partial: "warn",
  missing: "bad",
  unknown: "neutral",
} as const;

const percent = (value: number | null) => Math.round((value ?? 0) * 100);

export function StateChip({ tone, label, title }: { tone: Tone; label: string; title?: string }) {
  return (
    <span className={`state-chip tone-${tone}`} title={title}>
      {label}
    </span>
  );
}

function Score({ value, copy }: { value: number | null; copy: Copy }) {
  return value === null ? (
    <p className="dimension-value muted">{copy.notScorable}</p>
  ) : (
    <p className="dimension-value">
      <strong>{value}</strong>
      <span>{copy.outOf}</span>
    </p>
  );
}

function Card({
  title,
  question,
  children,
}: {
  title: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <section className="card dimension-card">
      <h2>{title}</h2>
      <p className="muted small dimension-question">{question}</p>
      {children}
    </section>
  );
}

/** The four dimensions side by side. Coverage is always its own line, never inside a score. */
export function DimensionCards({
  view,
  projectId,
  preferencesSaved,
  copy,
}: {
  view: AssessmentView;
  projectId: string;
  preferencesSaved: boolean;
  copy: Copy;
}) {
  const { technical, formal, evidence, economic } = view;
  const transferable = technical.items.filter((item) => item.state === "transferable");
  const gaps = technical.items.filter((item) => item.state === "gap");
  return (
    <div className="dimension-grid">
      <Card title={copy.dimensions.technical} question={copy.questions.technical}>
        <Score value={technical.score} copy={copy} />
        {technical.coverage !== null && (
          <p className="muted small">{copy.coverage(percent(technical.coverage))}</p>
        )}
        <p className="small">
          {copy.techCounts(
            technical.counts.direct,
            technical.counts.transferable,
            technical.counts.partial,
            technical.counts.unknown,
          )}
        </p>
        {transferable.length > 0 && (
          <p className="small">
            <strong>{copy.transferable}:</strong>{" "}
            {transferable
              .map((item) => `${item.requirement.normalised} (${copy.onboarding[item.onboarding]})`)
              .join(", ")}
          </p>
        )}
        {gaps.length > 0 && (
          <p className="small tone-text-bad">
            <strong>{copy.gaps}:</strong>{" "}
            {gaps.map((item) => item.requirement.normalised).join(", ")}
          </p>
        )}
      </Card>

      <Card title={copy.dimensions.formal} question={copy.questions.formal}>
        <p className="dimension-value">
          <strong>{formal.mandatory.fulfilled}</strong>
          <span>/ {formal.mandatory.total}</span>
        </p>
        <p className="small">
          {copy.formalFulfilled(formal.mandatory.fulfilled, formal.mandatory.total)}
        </p>
        <p className={`small ${formal.blockers.length > 0 ? "tone-text-bad" : ""}`}>
          {copy.blockers(formal.blockers.length)}
        </p>
        {formal.risks.length > 0 && (
          <p className="small tone-text-warn">{copy.risks(formal.risks.length)}</p>
        )}
        {formal.gaps.map((item) => (
          <p key={item.requirement.id} className="small">
            {copy.durationLine(
              item.requirement.normalised,
              item.duration!.confirmed,
              item.duration!.required,
            )}
          </p>
        ))}
      </Card>

      <Card title={copy.dimensions.evidence} question={copy.questions.evidence}>
        {evidence.available ? (
          <>
            <Score value={evidence.score} copy={copy} />
            {evidence.coverage !== null && (
              <p className="muted small">{copy.coverage(percent(evidence.coverage))}</p>
            )}
            <p className={`small ${evidence.gaps > 0 ? "tone-text-warn" : ""}`}>
              {copy.evidenceGaps(evidence.gaps)}
            </p>
          </>
        ) : (
          <p className="small">{copy.evidenceUnavailable}</p>
        )}
        {evidence.missingProfileData.length > 0 && (
          <p className="small muted">{copy.missingProfile(evidence.missingProfileData.length)}</p>
        )}
        <a
          className="pill small-pill secondary"
          href={`/projects/${projectId}/cv`}
          onClick={linkHandler(`/projects/${projectId}/cv`)}
        >
          {evidence.available ? copy.reviewEvidence : copy.createCv}
        </a>
      </Card>

      <Card title={copy.dimensions.economic} question={copy.questions.economic}>
        <Score value={economic.score} copy={copy} />
        <p className="muted small">{copy.coverage(percent(economic.coverage))}</p>
        {economic.exclusions.length > 0 && (
          <p className="small tone-text-bad">
            <strong>{copy.exclusions}:</strong> {economic.exclusions.length}
          </p>
        )}
        {economic.attractive.length > 0 && (
          <p className="small">
            <strong>{copy.attractive}:</strong>{" "}
            {economic.attractive.map((criterion) => copy.criteria[criterion]).join(", ")}
          </p>
        )}
        {economic.unfavourable.length > 0 && (
          <p className="small tone-text-warn">
            <strong>{copy.unfavourable}:</strong>{" "}
            {economic.unfavourable.map((criterion) => copy.criteria[criterion]).join(", ")}
          </p>
        )}
        {economic.openQuestions.length > 0 && (
          <p className="small muted">
            <strong>{copy.openQuestions}:</strong>{" "}
            {economic.openQuestions.map((question) => copy.criteria[question]).join(", ")}
          </p>
        )}
        <div className="dimension-links">
          {!preferencesSaved && (
            <a
              className="pill small-pill"
              href="/experience#preferences"
              onClick={linkHandler("/experience#preferences")}
            >
              {copy.setPreferences}
            </a>
          )}
          <a
            className="pill small-pill"
            href={`/projects/${projectId}/edit`}
            onClick={linkHandler(`/projects/${projectId}/edit`)}
          >
            {copy.editConditions}
          </a>
        </div>
      </Card>
    </div>
  );
}

/** A short, ordered list of what to do next, computed from the results, not by the model. */
export function ActionSummary({
  view,
  preferencesSaved,
  copy,
}: {
  view: AssessmentView;
  preferencesSaved: boolean;
  copy: Copy;
}) {
  const names = (entries: { items: FormalItem[] }) =>
    entries.items.map((item) => item.requirement.normalised).join(" / ");
  const todo: string[] = [
    ...view.formal.blockers.map((entry) => copy.todo.blocker(names(entry))),
    ...view.formal.gaps
      .filter((item) => item.state === "unverified")
      .map((item) => copy.todo.duration(item.requirement.normalised, item.duration!.gap)),
    ...view.formal.risks
      .filter((entry) => entry.items.every((item) => item.duration === null))
      .slice(0, 2)
      .map((entry) => copy.todo.risk(names(entry))),
    view.evidence.available
      ? view.evidence.gaps > 0 && copy.todo.evidence(view.evidence.gaps)
      : copy.todo.createCv,
    view.evidence.missingProfileData.length > 0 &&
      copy.todo.missingProfile(
        view.evidence.missingProfileData.map((entry) => entry.requirement.normalised).join(", "),
      ),
    !preferencesSaved
      ? copy.todo.preferences
      : view.economic.openQuestions.length > 0 &&
        copy.todo.questions(
          view.economic.openQuestions.map((question) => copy.criteria[question]).join(", "),
        ),
  ].filter((entry): entry is string => Boolean(entry));
  return (
    <section className="card todo-card" aria-labelledby="todo-title">
      <h2 id="todo-title">{copy.todoTitle}</h2>
      {todo.length === 0 ? (
        <p>{copy.todo.none}</p>
      ) : (
        <ol className="todo-list">
          {todo.slice(0, 5).map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// Requirements with their results in every dimension.

export type RequirementHandlers = {
  onAction: (action: ClarifyAction, requirement: Requirement) => Promise<void>;
  onCorrect: (
    requirement: Requirement,
    correction: Omit<CorrectionInput, "requirementId">,
  ) => Promise<void>;
  onReset: (requirement: Requirement) => Promise<void>;
};

function citeLabel(cite: Cite, experience: Experience): string {
  if (cite.kind !== "reference") {
    return cite.key;
  }
  const sorted = sortReferences(experience.references);
  const index = sorted.findIndex((reference) => reference.id === cite.key);
  return index < 0 ? cite.key : `${referenceLabel(index)} ${sorted[index]!.organization}`;
}

export function RequirementList({
  assessment,
  view,
  experience,
  copy,
  handlers,
}: {
  assessment: StoredAssessment;
  view: AssessmentView;
  experience: Experience;
  copy: Copy;
  handlers: RequirementHandlers;
}) {
  const technical = new Map(view.technical.items.map((item) => [item.requirement.id, item]));
  const formal = new Map(view.formal.items.map((item) => [item.requirement.id, item]));
  const evidence = new Map(view.evidence.items.map((item) => [item.requirement.id, item]));
  const missing = new Set(view.evidence.missingProfileData.map((entry) => entry.requirement.id));
  const corrected = new Set(assessment.corrections.map((entry) => entry.requirementId));
  return (
    <ul className="requirement-groups">
      {assessment.groups.map((group) => {
        const members = assessment.requirements.filter(
          (requirement) => requirement.groupId === group.id,
        );
        return (
          <li key={group.id} className="requirement-group">
            <p className="requirement-source">
              <span className={`state-chip tone-${group.mandatory ? "accent" : "neutral"}`}>
                {group.mandatory ? copy.mandatory : copy.optional}
              </span>
              <span>{group.source}</span>
              {group.operator === "any" && <span className="muted small">· {copy.anyOf}</span>}
            </p>
            <ul className="requirement-list">
              {members.map((requirement) => (
                <RequirementRow
                  key={requirement.id}
                  requirement={requirement}
                  technical={technical.get(requirement.id) ?? null}
                  formal={formal.get(requirement.id) ?? null}
                  evidence={evidence.get(requirement.id) ?? null}
                  missingProfile={missing.has(requirement.id)}
                  corrected={corrected.has(requirement.id)}
                  correction={
                    assessment.corrections.find(
                      (entry) => entry.requirementId === requirement.id,
                    ) ?? null
                  }
                  experience={experience}
                  copy={copy}
                  handlers={handlers}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function RequirementRow({
  requirement,
  technical,
  formal,
  evidence,
  missingProfile,
  corrected,
  correction,
  experience,
  copy,
  handlers,
}: {
  requirement: Requirement;
  technical: TechnicalItem | null;
  formal: FormalItem | null;
  evidence: EvidenceItem | null;
  missingProfile: boolean;
  corrected: boolean;
  correction: StoredAssessment["corrections"][number] | null;
  experience: Experience;
  copy: Copy;
  handlers: RequirementHandlers;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const cites = [...(technical?.cites ?? []), ...(formal?.cites ?? [])].filter(
    (cite, index, all) =>
      all.findIndex((other) => other.kind === cite.kind && other.key === cite.key) === index,
  );
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="requirement">
      <details>
        <summary aria-label={copy.details(requirement.normalised)}>
          <span className="requirement-name">
            <strong>{requirement.normalised}</strong>
            <span className="muted small">{copy.categories[requirement.category]}</span>
          </span>
          <span className="requirement-chips">
            {technical && (
              <StateChip
                tone={TECHNICAL_TONE[technical.state]}
                label={copy.technicalStates[technical.state]}
                title={copy.dimensions.technical}
              />
            )}
            {formal && formal.state !== "not_applicable" && (
              <StateChip
                tone={FORMAL_TONE[formal.state]}
                label={copy.formalStates[formal.state]}
                title={copy.dimensions.formal}
              />
            )}
            {evidence && (
              <StateChip
                tone={EVIDENCE_TONE[evidence.state]}
                label={copy.evidenceStates[evidence.state]}
                title={copy.dimensions.evidence}
              />
            )}
            {missingProfile && <StateChip tone="neutral" label={copy.profileMissing} />}
            {corrected && <span className="muted small">{copy.corrected}</span>}
          </span>
        </summary>
        <div className="requirement-details">
          {requirement.text !== requirement.normalised && (
            <p className="muted small">„{requirement.text}“</p>
          )}
          {technical?.note && <p>{technical.note}</p>}
          {technical && (technical.state === "transferable" || technical.state === "partial") && (
            <p className="small">{copy.onboarding[technical.onboarding]}</p>
          )}
          {formal && formal.state !== "not_applicable" && (
            <p className="small">{copy.reasons[formal.reason]}</p>
          )}
          {formal?.duration && (
            <p className="small">
              {copy.duration(
                formal.duration.required,
                formal.duration.confirmed,
                formal.duration.possible,
              )}
            </p>
          )}
          {formal?.levels?.required && formal.levels.listed && (
            <p className="small">{copy.levels(formal.levels.required, formal.levels.listed)}</p>
          )}
          {evidence && evidence.missingKeywords.length > 0 && (
            <p className="small">{copy.missingKeywords(evidence.missingKeywords.join(", "))}</p>
          )}
          {cites.length > 0 && (
            <p className="small">
              <strong>{copy.basedOn}:</strong>{" "}
              {cites.map((cite) => citeLabel(cite, experience)).join(", ")}
            </p>
          )}
          {correction?.note && <p className="small muted">„{correction.note}“</p>}
          {formal && formal.actions.length > 0 && (
            <div className="clarify-actions">
              {formal.actions.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  className="pill small-pill secondary"
                  disabled={busy}
                  title={
                    action.kind === "confirm_usage"
                      ? copy.confirmUsageTitle(action.skill)
                      : undefined
                  }
                  onClick={() => void run(() => handlers.onAction(action, requirement))}
                >
                  {copy.actions[action.kind]}
                </button>
              ))}
            </div>
          )}
          {editing ? (
            <CorrectionForm
              requirement={requirement}
              correction={correction}
              experience={experience}
              copy={copy}
              onCancel={() => setEditing(false)}
              onSave={(next) =>
                run(async () => {
                  await handlers.onCorrect(requirement, next);
                  setEditing(false);
                })
              }
            />
          ) : (
            <div className="clarify-actions">
              <button
                type="button"
                className="link"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                {copy.correct}
              </button>
              {corrected && (
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() => void run(() => handlers.onReset(requirement))}
                >
                  {copy.reset}
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function CorrectionForm({
  requirement,
  correction,
  experience,
  copy,
  onSave,
  onCancel,
}: {
  requirement: Requirement;
  correction: StoredAssessment["corrections"][number] | null;
  experience: Experience;
  copy: Copy;
  onSave: (correction: Omit<CorrectionInput, "requirementId">) => Promise<void>;
  onCancel: () => void;
}) {
  const technicalApplies = requirement.dimensions.includes("technical");
  const [technical, setTechnical] = useState<TechnicalState | "">(
    correction?.technical?.state ?? "",
  );
  const [cites, setCites] = useState<string[]>(
    (correction?.technical?.cites ?? [])
      .filter((cite) => cite.kind === "reference")
      .map((cite) => cite.key),
  );
  const [formal, setFormal] = useState<FormalState | "">(correction?.formal ?? "");
  const [note, setNote] = useState(correction?.note ?? "");
  const references = sortReferences(experience.references);
  return (
    <form
      className="form compact correction-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          technical: technical
            ? { state: technical, cites: cites.map((key) => ({ kind: "reference" as const, key })) }
            : null,
          formal: formal || null,
          note,
        });
      }}
    >
      {technicalApplies && (
        <label>
          {copy.correctTechnical}
          <select
            className="select-field"
            value={technical}
            onChange={(event) => setTechnical(event.target.value as TechnicalState | "")}
          >
            <option value="">{copy.asAssessed}</option>
            {TECHNICAL_STATES.map((state) => (
              <option key={state} value={state}>
                {copy.technicalStates[state]}
              </option>
            ))}
          </select>
        </label>
      )}
      {technicalApplies && technical && technical !== "unknown" && references.length > 0 && (
        <fieldset className="reference-choices">
          <legend>{copy.correctCites}</legend>
          {references.map((reference, index) => (
            <label key={reference.id} className="checkbox">
              <input
                type="checkbox"
                checked={cites.includes(reference.id)}
                disabled={!cites.includes(reference.id) && cites.length >= 4}
                onChange={() =>
                  setCites((current) =>
                    current.includes(reference.id)
                      ? current.filter((id) => id !== reference.id)
                      : [...current, reference.id],
                  )
                }
              />
              <span className="badge">{referenceLabel(index)}</span>
              {reference.organization}
            </label>
          ))}
        </fieldset>
      )}
      {requirement.dimensions.includes("formal") && (
        <label>
          {copy.correctFormal}
          <select
            className="select-field"
            value={formal}
            onChange={(event) => setFormal(event.target.value as FormalState | "")}
          >
            <option value="">{copy.asAssessed}</option>
            {FORMAL_STATES.map((state) => (
              <option key={state} value={state}>
                {copy.formalStates[state]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {copy.note}
        <input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="form-actions">
        <button className="button">{copy.save}</button>
        <button type="button" className="pill" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------
// The compact view for the projects list.

export function AssessmentCell({
  summary,
  legacyScore,
  copy,
}: {
  summary: AssessmentSummary | null;
  legacyScore: number | null | undefined;
  copy: Copy;
}) {
  if (!summary) {
    return legacyScore !== undefined ? (
      <span className="assessment-cell legacy" title={copy.legacyLead}>
        {copy.legacyLabel(legacyScore)}
      </span>
    ) : (
      <span className="muted small">{copy.list.notAssessed}</span>
    );
  }
  const value = (score: number | null) => (score === null ? "–" : String(score));
  return (
    <span className="assessment-cell">
      <span className="assessment-values">
        <span title={copy.dimensions.technical}>
          <small>{copy.list.technical}</small> {value(summary.technical.score)}
        </span>
        <span title={copy.dimensions.formal}>
          <small>{copy.list.formal}</small> {summary.formal.fulfilled}/{summary.formal.total}
        </span>
        <span title={copy.dimensions.evidence}>
          <small>{copy.list.evidence}</small>{" "}
          {summary.evidence.available ? value(summary.evidence.score) : "–"}
        </span>
        <span title={copy.dimensions.economic}>
          <small>{copy.list.economic}</small> {value(summary.economic.score)}
        </span>
      </span>
      {(summary.formal.blockers.length > 0 ||
        summary.formal.risks.length > 0 ||
        summary.evidence.gaps > 0) && (
        <span className="assessment-flags">
          {summary.formal.blockers.length > 0 && (
            <StateChip
              tone="bad"
              label={copy.list.blockers(summary.formal.blockers.length)}
              title={summary.formal.blockers.join(", ")}
            />
          )}
          {summary.formal.risks.length > 0 && (
            <StateChip
              tone="warn"
              label={copy.list.risks(summary.formal.risks.length)}
              title={summary.formal.risks.join(", ")}
            />
          )}
          {summary.evidence.available && summary.evidence.gaps > 0 && (
            <StateChip tone="warn" label={copy.list.gaps(summary.evidence.gaps)} />
          )}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------
// The evidence panel on the CV page.

export function EvidencePanel({
  evidence,
  experience,
  copy,
  onApply,
  onWrite,
}: {
  evidence: Evidence | null;
  experience: Experience;
  copy: Copy;
  onApply: (suggestion: EvidenceSuggestion) => void;
  onWrite: () => void;
}) {
  const text = copy.cvPanel;
  if (!evidence) {
    return (
      <section className="card evidence-panel" id="evidence" aria-labelledby="evidence-title">
        <h2 id="evidence-title">{text.title}</h2>
        <p className="muted">{text.notAssessed}</p>
      </section>
    );
  }
  const organization = (id: string | null) =>
    id
      ? (experience.references.find((reference) => reference.id === id)?.organization ?? null)
      : null;
  const open = evidence.items.filter(
    (item) => item.state === "partial" || item.state === "missing",
  );
  return (
    <section className="card evidence-panel" id="evidence" aria-labelledby="evidence-title">
      <div className="card-heading">
        <h2 id="evidence-title">{text.title}</h2>
        <span className="tag accent" aria-live="polite">
          {text.score(evidence.score)}
        </span>
      </div>
      <p className="muted small">{text.lead}</p>
      {open.length === 0 ? (
        <p>{text.none}</p>
      ) : (
        <ul className="evidence-list">
          {open.map((item) => (
            <li key={item.requirement.id}>
              <div>
                <strong>{item.requirement.normalised}</strong>{" "}
                <StateChip
                  tone={EVIDENCE_TONE[item.state]}
                  label={copy.evidenceStates[item.state]}
                />
                {item.missingKeywords.length > 0 && (
                  <p className="muted small">
                    {copy.missingKeywords(item.missingKeywords.join(", "))}
                  </p>
                )}
              </div>
              <ul className="suggestion-list">
                {item.suggestions.map((suggestion) => (
                  <li
                    key={`${suggestion.kind}-${"referenceId" in suggestion ? suggestion.referenceId : ""}`}
                  >
                    {suggestion.kind === "select_reference" ? (
                      <>
                        <span>
                          {text.selectReference(organization(suggestion.referenceId) ?? "")}
                        </span>
                        <button
                          type="button"
                          className="pill small-pill positive"
                          onClick={() => onApply(suggestion)}
                        >
                          {text.apply}
                        </button>
                      </>
                    ) : suggestion.kind === "add_skill" ? (
                      <>
                        <span>{text.addSkill(suggestion.skill)}</span>
                        <button
                          type="button"
                          className="pill small-pill positive"
                          onClick={() => onApply(suggestion)}
                        >
                          {text.apply}
                        </button>
                      </>
                    ) : (
                      <>
                        <span>
                          {text.mention(suggestion.term, organization(suggestion.referenceId))}
                        </span>
                        <button type="button" className="pill small-pill secondary" onClick={onWrite}>
                          {text.writeIt}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {evidence.missingProfileData.length > 0 && (
        <>
          <h3>{text.missingProfileTitle}</h3>
          <p className="muted small">{text.missingProfileLead}</p>
          <p>
            {evidence.missingProfileData.map((entry) => entry.requirement.normalised).join(", ")}{" "}
            <a className="link" href="/experience" onClick={linkHandler("/experience")}>
              {copy.actions.add_experience}
            </a>
          </p>
        </>
      )}
    </section>
  );
}
