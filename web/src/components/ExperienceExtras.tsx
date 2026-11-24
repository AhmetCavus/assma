import { useEffect, useState } from "react";
import {
  CONTRACT_TYPES,
  DEFAULT_ECONOMIC_PREFERENCES,
  ECONOMIC_CRITERIA,
  economicPreferencesSchema,
  toApiError,
  TRAVEL_LEVELS,
  type AssmaApi,
  type ContractType,
  type EconomicPreferences,
  type ExperienceReference,
  type SkillFact,
  type SkillUsagePeriod,
} from "@assma/shared";
import { experienceChanged, preferencesChanged } from "../lib/assessment";
import type { Preferences } from "../lib/preferences";

type Copy = Preferences["copy"];

export type UsageState = "confirmed" | "assumed" | "unknown";

export function usageState(reference: ExperienceReference, skill: string): UsageState {
  const entry = reference.skillUsage.find(
    (usage) => usage.skill.toLowerCase() === skill.toLowerCase(),
  );
  return !entry ? "assumed" : entry.period === "unknown" ? "unknown" : "confirmed";
}

const MARK: Record<UsageState, string> = { confirmed: "✓", assumed: "~", unknown: "?" };

/** A reference's skills, each marked with how its usage period is known. */
export function SkillUsageChips({
  reference,
  copy,
}: {
  reference: ExperienceReference;
  copy: Copy;
}) {
  const text = copy.experience.usage;
  return (
    <span className="skill-chips">
      {reference.skills.map((skill) => {
        const state = usageState(reference, skill);
        return (
          <span key={skill} className={`skill-chip usage-${state}`} title={text[state]}>
            <span aria-hidden="true">{MARK[state]}</span> {skill}
            <span className="visually-hidden"> ({text[state]})</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Confirms how skills were used at one engagement: several at once for the whole
 * engagement, or a period of their own, or that the time is unknown.
 */
export function UsagePanel({
  reference,
  api,
  copy,
  onSaved,
  onClose,
  onFailure,
}: {
  reference: ExperienceReference;
  api: AssmaApi;
  copy: Copy;
  onSaved: (reference: ExperienceReference, message: string) => void;
  onClose: () => void;
  onFailure: (failure: unknown) => void;
}) {
  const text = copy.experience.usage;
  const [selected, setSelected] = useState<string[]>(() =>
    reference.skills.filter((skill) => usageState(reference, skill) !== "confirmed"),
  );
  const [ownPeriod, setOwnPeriod] = useState(false);
  const [start, setStart] = useState<string>(reference.start);
  const [end, setEnd] = useState<string>(reference.end ?? "");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm(period: SkillUsagePeriod) {
    if (selected.length === 0) {
      setProblem(text.none);
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const updated = await api.confirmUsage(reference.id, { skills: selected, period });
      experienceChanged();
      onSaved(updated, text.saved);
    } catch (failure) {
      onFailure(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="usage-panel" role="group" aria-label={text.title(reference.organization)}>
      <p className="muted small">{text.lead}</p>
      <div className="usage-skills">
        {reference.skills.map((skill) => (
          <label key={skill} className="checkbox">
            <input
              type="checkbox"
              checked={selected.includes(skill)}
              onChange={() =>
                setSelected((current) =>
                  current.includes(skill)
                    ? current.filter((item) => item !== skill)
                    : [...current, skill],
                )
              }
            />
            {skill}
            <span className="muted small"> · {text[usageState(reference, skill)]}</span>
          </label>
        ))}
      </div>
      {ownPeriod && (
        <div className="form-row usage-period">
          <label>
            {text.from}
            <input
              type="month"
              value={start}
              min={reference.start}
              max={reference.end ?? undefined}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            {text.to}
            <input
              type="month"
              value={end}
              min={start}
              max={reference.end ?? undefined}
              placeholder={text.ongoing}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
      )}
      {problem && (
        <small className="field-error" role="alert">
          {problem}
        </small>
      )}
      <div className="form-actions">
        {ownPeriod ? (
          <button
            type="button"
            className="button positive"
            disabled={busy}
            onClick={() => void confirm({ start, end: end || null })}
          >
            {text.savePeriod}
          </button>
        ) : (
          <button
            type="button"
            className="button positive"
            disabled={busy}
            onClick={() => void confirm("engagement")}
          >
            {text.whole}
          </button>
        )}
        <button
          type="button"
          className="pill"
          disabled={busy}
          onClick={() => setOwnPeriod((value) => !value)}
        >
          {ownPeriod ? text.whole : text.period}
        </button>
        <button
          type="button"
          className="pill tertiary"
          disabled={busy}
          onClick={() => void confirm("unknown")}
        >
          {text.markUnknown}
        </button>
        <button type="button" className="link" onClick={onClose}>
          {text.close}
        </button>
      </div>
    </div>
  );
}

/** What the person stated about skills across all projects; each can be removed again. */
export function SkillFactsList({
  facts,
  api,
  copy,
  onChanged,
  onFailure,
}: {
  facts: SkillFact[];
  api: AssmaApi;
  copy: Copy;
  onChanged: (facts: SkillFact[], message: string) => void;
  onFailure: (failure: unknown) => void;
}) {
  const text = copy.experience.facts;
  if (facts.length === 0) {
    return null;
  }
  async function remove(fact: SkillFact) {
    try {
      const next = await api.saveSkillFacts({
        facts: facts.filter((entry) => entry.skill.toLowerCase() !== fact.skill.toLowerCase()),
      });
      experienceChanged();
      onChanged(next, text.removed);
    } catch (failure) {
      onFailure(failure);
    }
  }
  return (
    <div className="skill-facts">
      <h3>{text.title}</h3>
      <p className="muted small">{text.lead}</p>
      <ul>
        {facts.map((fact) => (
          <li key={fact.skill}>
            <strong>{fact.skill}</strong> · {fact.status === "complete" ? text.complete : text.none}
            <button
              type="button"
              className="icon-button small-button"
              aria-label={text.remove(fact.skill)}
              title={text.remove(fact.skill)}
              onClick={() => void remove(fact)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Economic preferences: stored apart from experience, shown on the same page.

const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? "any"}
        inputMode="decimal"
        value={value ?? ""}
        onChange={(event) => onChange(numberOrNull(event.target.value))}
      />
    </label>
  );
}

export function PreferencesSection({
  api,
  copy,
  onSaved,
  onFailure,
}: {
  api: AssmaApi;
  copy: Copy;
  onSaved: (message: string) => void;
  onFailure: (failure: unknown) => void;
}) {
  const text = copy.preferences;
  const criteria = copy.assessment.criteria;
  const contracts = copy.assessment.contracts;
  const travel = copy.capture.conditions.travelLevels;
  const [value, setValue] = useState<EconomicPreferences | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .preferences()
      .then((stored) => active && setValue(stored.economic ?? DEFAULT_ECONOMIC_PREFERENCES))
      .catch((failure: unknown) => active && onFailure(failure));
    return () => {
      active = false;
    };
  }, [api]);

  if (!value) {
    return null;
  }
  const update = <K extends keyof EconomicPreferences>(
    key: K,
    change: Partial<EconomicPreferences[K]>,
  ) =>
    setValue(
      (current) => current && { ...current, [key]: { ...(current[key] as object), ...change } },
    );
  const toggle = (list: ContractType[], contract: ContractType) =>
    list.includes(contract) ? list.filter((item) => item !== contract) : [...list, contract];

  async function save() {
    const parsed = economicPreferencesSchema.safeParse(value);
    if (!parsed.success) {
      setProblem(text.invalid);
      return;
    }
    setProblem("");
    setBusy(true);
    try {
      const stored = await api.saveEconomicPreferences(parsed.data);
      setValue(stored.economic);
      preferencesChanged();
      onSaved(text.saved);
    } catch (failure) {
      if (toApiError(failure).code === "invalid_input") {
        setProblem(text.invalid);
      } else {
        onFailure(failure);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card preferences-card" id="preferences" aria-labelledby="preferences-title">
      <h2 id="preferences-title">{text.title}</h2>
      <p className="muted small">{text.lead}</p>
      <form
        className="form compact"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="preference-group">
          <legend>{text.weights}</legend>
          <small className="muted">{text.weightsHint}</small>
          <div className="preference-row">
            {ECONOMIC_CRITERIA.map((criterion) => (
              <NumberField
                key={criterion}
                label={criteria[criterion]}
                value={value.weights[criterion]}
                max={100}
                step="1"
                onChange={(next) => update("weights", { [criterion]: next ?? 0 })}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.freelance}</legend>
          <div className="preference-row">
            <NumberField
              label={text.target}
              value={value.freelance.target}
              onChange={(next) => update("freelance", { target: next })}
            />
            <NumberField
              label={text.minimum}
              value={value.freelance.minimum}
              onChange={(next) => update("freelance", { minimum: next })}
            />
            <label>
              &nbsp;
              <select
                className="select-field"
                value={value.freelance.unit}
                onChange={(event) =>
                  update("freelance", { unit: event.target.value as "hour" | "day" })
                }
              >
                <option value="hour">{text.perHour}</option>
                <option value="day">{text.perDay}</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.employment}</legend>
          <div className="preference-row">
            <NumberField
              label={text.target}
              value={value.employment.target}
              onChange={(next) => update("employment", { target: next })}
            />
            <NumberField
              label={text.minimum}
              value={value.employment.minimum}
              onChange={(next) => update("employment", { minimum: next })}
            />
            <NumberField
              label={text.referenceHours}
              value={value.employment.referenceHours}
              min={1}
              max={80}
              onChange={(next) => update("employment", { referenceHours: next ?? 40 })}
            />
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.remote}</legend>
          <div className="preference-row">
            <NumberField
              label={text.target}
              value={value.remote.target}
              max={100}
              step="1"
              onChange={(next) => update("remote", { target: next })}
            />
            <NumberField
              label={text.minimum}
              value={value.remote.minimum}
              max={100}
              step="1"
              onChange={(next) => update("remote", { minimum: next })}
            />
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.contracts}</legend>
          {CONTRACT_TYPES.map((contract) => (
            <div key={contract} className="preference-contract">
              <strong>{contracts[contract]}</strong>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={value.contracts.preferred.includes(contract)}
                  onChange={() =>
                    update("contracts", { preferred: toggle(value.contracts.preferred, contract) })
                  }
                />
                {text.preferred}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={value.contracts.acceptable.includes(contract)}
                  onChange={() =>
                    update("contracts", {
                      acceptable: toggle(value.contracts.acceptable, contract),
                    })
                  }
                />
                {text.acceptable}
              </label>
            </div>
          ))}
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.duration}</legend>
          <div className="preference-row">
            <NumberField
              label={text.minimum}
              value={value.duration.minimum}
              min={1}
              max={120}
              step="1"
              onChange={(next) => update("duration", { minimum: next })}
            />
            <NumberField
              label={text.target}
              value={value.duration.target}
              min={1}
              max={120}
              step="1"
              onChange={(next) => update("duration", { target: next })}
            />
            <NumberField
              label={text.maximum}
              value={value.duration.maximum}
              min={1}
              max={120}
              step="1"
              onChange={(next) => update("duration", { maximum: next })}
            />
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.workload}</legend>
          <div className="preference-row">
            <NumberField
              label={text.target}
              value={value.workload.target}
              min={1}
              max={80}
              onChange={(next) => update("workload", { target: next })}
            />
            <NumberField
              label={text.maximum}
              value={value.workload.maximum}
              min={1}
              max={80}
              onChange={(next) => update("workload", { maximum: next })}
            />
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.travel}</legend>
          <div className="preference-row">
            {(["target", "maximum"] as const).map((key) => (
              <label key={key}>
                {key === "target" ? text.target : text.maximum}
                <select
                  className="select-field"
                  value={value.travel[key] ?? ""}
                  onChange={(event) =>
                    update("travel", {
                      [key]: (event.target.value ||
                        null) as EconomicPreferences["travel"]["target"],
                    })
                  }
                >
                  <option value="">–</option>
                  {TRAVEL_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {travel[level]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>{text.exclusions}</legend>
          <small className="muted">{text.exclusionsHint}</small>
          <div className="preference-row">
            <NumberField
              label={text.minimumRate}
              value={value.exclusions.minimumRate}
              onChange={(next) => update("exclusions", { minimumRate: next })}
            />
            <NumberField
              label={text.minimumSalary}
              value={value.exclusions.minimumSalary}
              onChange={(next) => update("exclusions", { minimumSalary: next })}
            />
            <NumberField
              label={text.minimumRemote}
              value={value.exclusions.minimumRemote}
              max={100}
              step="1"
              onChange={(next) => update("exclusions", { minimumRemote: next })}
            />
          </div>
          <div className="preference-checks">
            <span className="muted small">{text.excludedContracts}:</span>
            {CONTRACT_TYPES.map((contract) => (
              <label key={contract} className="checkbox">
                <input
                  type="checkbox"
                  checked={value.exclusions.contracts.includes(contract)}
                  onChange={() =>
                    update("exclusions", {
                      contracts: toggle(value.exclusions.contracts, contract),
                    })
                  }
                />
                {contracts[contract]}
              </label>
            ))}
          </div>
        </fieldset>

        {problem && (
          <small className="field-error" role="alert">
            {problem}
          </small>
        )}
        <div className="form-actions">
          <button className="button" disabled={busy}>
            {busy ? copy.common.working : text.save}
          </button>
        </div>
      </form>
    </section>
  );
}
