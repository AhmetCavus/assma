# Design

## Context

See proposal.md – Why. Current state relevant to the approach:

- **The fit check today:** `server/src/projects/fit.service.ts` runs one structured model call through `inference().streamStructured` on the shared `modelJobs` queue. The model returns `confirmed / partial / missing` plus reference labels (E01…) per requirement, and `shared/src/fit.ts` validates the answer and computes the score.
- **Corrections:** `PUT /projects/:id/fit/findings/:index` stores per-finding corrections, which are lost on reassessment.
- **Requirements:** `project.required` and `project.preferred` are lists of strings that the listing reader suggests and the person edits.
- **Working terms:** they live in one free-text field, `terms`.
- **References:** each has `start`/`end` months, a skill list and a contribution. `shared/src/skills.ts` already merges overlapping months (`coveredMonths`) for the CV skill matrix.
- **Profile data:** education (degree, institution, start/end years), languages (name, CEFR level or native), certificates (name, issuer, year).
- **The project CV draft** holds the summary, selected references, skills and design. The rendered CV always includes the profile's education, languages and certificates.
- **Application snapshots** freeze `fit` (`snapshotSchema.fit`).
- **The model:** a 14B open-weight model on one GPU (vLLM), with a CPU fallback. Structured output works, but long schemas and long prompts are slow and occasionally loop (the runaway guard exists).

## Goals / Non-Goals

**Goals:**

- Use the model for interpretation only. The deterministic engines in `shared` do all counting, comparing and scoring, so they are unit-testable and run identically in browser and server.
- Keep the model at two calls per assessment.
- Recalculate Evidence and Economic instantly in the browser.

**Non-Goals:**

- No per-requirement chat.
- No automatic CV rewriting of facts.
- No new inference provider or framework.
- No background re-assessment of all projects.
- No changes to Progress, applications or capture beyond the condition fields.

## Decisions

### 1. Model in two steps, everything else in code

| Step                 | Who            | Output                                                                                                                                          |
| -------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Extract requirements | model (call 1) | groups → requirements: text, normalised, category, mandatory, months, level, dimensions                                                         |
| Technical judgement  | model (call 2) | per technical requirement: state, onboarding, cited labels (E01 references, P01 personal items), short note                                     |
| Formal Fit           | code           | per formal requirement from durations, education, languages, certificates; model judgement is only used for "is this technology present at all" |
| Evidence             | code           | from the requirement → supporting data mapping, the CV draft and keyword presence                                                               |
| Economic             | code           | from project conditions × preferences                                                                                                           |

**Why not one call?** A combined schema is long, and the 14B model drops fields or loops more often.

**Why not more calls?** Each call is 10–60 s on the GPU and minutes on the CPU.

**Caching:** extraction is cached on the project by a fingerprint of the listing (`brief`, `required`, `preferred`, `tech`, `terms`). Reassessing after a profile change only repeats call 2.

**Alternatives considered:**

- Deterministic keyword matching for Technical Fit: rejected; it can't do "Codex → Claude Code".
- Model-computed scores: rejected; the scores would not be reproducible or testable.

### 2. Requirement groups

```
requirementGroup { id, operator: "all" | "any", mandatory, source (original sentence) }
requirement      { id, groupId, text, normalised, category, months|null, level|null, dimensions[] }
```

- Each extracted requirement gets a stable id from its normalised text and category (hash). This lets corrections survive reassessment.
- **AND/OR evaluation:**
  - An `any` group takes its best member for Technical and Formal.
  - An `all` group counts each member.
  - For the Technical score, a group's members share the group's weight (2 for mandatory, 1 for optional), so splitting "Kotlin, Coroutines, Compose" does not triple its weight.
- If extraction fails, the existing `required` and `preferred` lines become one-member `all` groups: mandatory and optional respectively, category technical. The assessment always has a basis.

### 3. Technical Fit scoring

| State        | Earned   |
| ------------ | -------- |
| direct       | 1        |
| transferable | 0.75     |
| partial      | 0.4      |
| gap          | 0        |
| unknown      | excluded |

- **Score:** `round(10 × earned / assessed weight)`, clamped 0–10. The score is null when nothing could be assessed.
- **Coverage:** assessed weight / total weight.
- **Onboarding** (`minimal`…`unknown`) is shown, not scored.
- **Plausibility rule:** a `direct`/`transferable`/`partial` state without a valid cited label becomes `unknown`.
- **Gap rule (missing documentation ≠ missing experience):** the model's `gap` is kept only when verified data supports it, i.e. the model cites the data showing the related experience that falls short (e.g. general software engineering for an ML requirement). An uncited `gap` becomes `unknown`. A skill fact `none` or the person's correction sets `gap` explicitly.

### 4. Usage periods and confirmed facts (experience domain)

- **Usage per reference skill:** `reference.skillUsage: { skill, period: "engagement" | { start, end|null } | "unknown" }[]`.
  - A skill on the reference without an entry is **assumed**.
  - `"engagement"` is **confirmed** for the reference period.
  - A stated period is **confirmed** for that period.
  - `"unknown"` means the person knows the skill was used but not when; it counts no months.
- **One action** in the reference editor confirms several (or all) of a reference's skills for the whole engagement. A separate period is only entered when it differs.
- **Skill facts:** `profile.skillFacts: { skill, status: "complete" | "none" }[]`.
  - `complete`: "this is all my experience with X".
  - `none`: "I have no experience with X".

  They live with the experience data because they are statements about experience, reusable across projects. Per-requirement corrections (design 7) cover project-specific statements.

- **Durations** are computed per skill (aliases matched, case- and accent-insensitive). The result is the merged confirmed months and the merged confirmed+assumed months, both counting each month once (`coveredMonths`). The unknown count is the number of references with usage `"unknown"`.

### 5. Formal Fit

Formal requirements are those in the categories professional experience, education, certification, language, or with a `months` value. Each decision only uses stated facts:

| Requirement             | Fulfilled                                                                                                        | Not fulfilled (only)                                                                    | Otherwise                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Duration (`months`)     | confirmed months ≥ required                                                                                      | skill fact `none`; or skill fact `complete` and confirmed months < required (gap shown) | Unverified: confirmed / assumed / required / gap shown |
| Technology, no duration | any confirmed or assumed usage, or a cited reference                                                             | skill fact `none`                                                                       | Unverified                                             |
| Language                | listed level ≥ required (native > C2 > … > A1)                                                                   | language listed below the required level (contradicting fact)                           | Unverified (language not listed)                       |
| Education               | a completed entry (end year ≤ now) of the required level, with the field cited by the model when one is required | none (a missing degree is not a confirmed fact)                                         | Unverified                                             |
| Certification           | certificate listed (alias match or model citation)                                                               | none                                                                                    | Unverified                                             |
| Any                     | —                                                                                                                | the person's correction "not fulfilled"                                                 | —                                                      |

- Per-requirement corrections always win.
- Transferable or partial Technical results never fulfil.
- **Summary:**
  - fulfilled / total mandatory;
  - unverified mandatory, shown as potential risks;
  - blockers (mandatory not fulfilled);
  - duration gaps;
  - one clarify action per unverified item: add experience, confirm usage, confirm complete, or deny.

### 6. Evidence

**Supporting data** of a requirement:

- references cited by Technical or matched by skill;
- education, language and certificate entries matched by Formal.

**Missing profile data:** a requirement without supporting data is listed under "missing profile data" with the action to supplement the profile. It never counts as an Evidence gap and gets no CV suggestion.

**Evidence states**, for requirements with supporting data, against the current CV draft:

| Evidence state | Condition                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full           | the supporting reference or profile entry is in the CV; the term or an alias is in the CV text (summary, selected contributions, skills, education, certificates, languages); for duration requirements the skill appears in the skill matrix |
| partial        | supporting data is in the CV, but a required keyword or the duration is absent                                                                                                                                                                |
| missing        | supporting data exists but none of it is in the CV                                                                                                                                                                                            |
| unknown        | the support depends on an Unknown Technical result                                                                                                                                                                                            |

- **Score:** `round(10 × (full + 0.5·partial) / (full + partial + missing))`.
- **Coverage:** (full + partial + missing) / requirements with supporting data, shown separately.
- **Gaps:** the number of partial + missing.
- **No CV draft:** `available: false`. The card shows "not available yet" and "create CV"; missing profile data is still listed.

**Suggestions** are typed, so they can only use existing data:

- `select_reference(id)`
- `add_skill(term)`: only if an existing reference lists the term
- `confirm_usage(referenceId, skills[])`
- `mention_in_summary(term, referenceId)`: the person writes or approves the text; nothing is inserted automatically

**CV text:** `cvPlainText(draft, profile, references)` (shared) builds the CV text for keyword checks. The browser recalculates on every draft change.

### 6a. Economic (preferences domain, separate from experience)

**Project:** `conditions { compensation: { amount, unit: hour|day|month|year, currency }|null, contract: freelance|employment|temporary|null, remote: 0–100|null, months|null, hoursPerWeek|null, start: date|null, onsite: string, travel: none|occasional|frequent|null }`.

- `null` means unknown.
- Conditions are suggested by the listing reader and by extraction call 1, and editable.

**Preferences:** a new collection `AssmaPreferences`, one document per owner, in its own `shared/src/preferences.ts` contract. Nothing is shared with the experience contracts.

- `weights` per criterion (defaults 30/25/20/10/10/5).
- `freelance { target, minimum, unit: hour|day, currency }`.
- `employment { target, minimum, currency, referenceHours (default 40) }`: annual.
- `remote { target, minimum }`.
- `contracts { preferred[], excluded[] }`.
- `duration { minMonths, maxMonths }`.
- `hours { target, maximum }`.
- `travel { tolerance }`.
- `exclusions { minRate, minSalary, minRemote, contracts }`.

**Sub-scores (0–1):**

- Target or better → 1. Linear between the acceptable minimum and the target. Outside the acceptable range → 0.
- **Compensation:** freelance day rates are converted to hourly with 8 h; employment is compared to `target × projectHours / referenceHours`. With unknown hours, the reference hours are used and an open question is added.
- **Not configured:** a criterion without a configured target is "not configured" and is excluded like unknown.

**Score:** `10 × Σ(w·sub) / Σ(w of known and configured criteria)`. Coverage = that weight / Σ all weights.

**Breakdown:** attractive (sub ≥ 0.75), unfavourable (≤ 0.35), unknown, not configured, exclusions (listed separately and never folded into the score).

### 7. Storage, API and migration

**Project storage:** `project.assessment`, a new mixed field validated on read like `fit`:

```
{ version: 2, basis: { listing, profile }, extraction: { fingerprint, groups, requirements, conditionsSuggested },
  technical: [{ requirementId, state, onboarding, cites[], note, corrected }],
  formal: computed on read, evidence: computed, economic: computed,
  corrections: { [requirementId]: { technical?: { state, cites }, formal?: "fulfilled"|"not_fulfilled"|"not_applicable", note } }, assessedAt }
```

- **What is stored:** only the model results and the corrections. Formal, Evidence and Economic are pure functions of stored data plus profile, CV and preferences. They are computed on read (server) and live (browser), so they can never be stale relative to their inputs.
- **Corrections** are keyed by requirement id and applied after each reassessment. Reset deletes them.

**Migration:** none at write time. `project.fit` stays readable and is labelled as the legacy assessment until `assessment` exists.

**Snapshots:** they gain an optional `assessment` (the computed four-dimension view at submission). `fit` stays, so old snapshots render unchanged.

**API:**

- `POST /projects/:id/fit` (kept path) runs the new assessment.
- `PUT /projects/:id/assessment/corrections/:requirementId` and `DELETE …` (reset).
- `PUT /projects/:id/conditions`.
- `GET` / `PUT /preferences/economic`.
- **Experience:** existing reference routes carry `skillUsage`; `PUT /experience/skill-facts` for confirmed facts.
- The legacy findings route is removed after the UI switches.

### 8. UI

**Fit page:**

- Four cards in one row: Technical, Formal, Evidence, Economic. They collapse to 2×2 on tablets and stack on phones, and use the existing card, score and status-badge styles.
- Coverage is shown as its own line, never folded into the score.
- Below the cards: a summary of at most 3–5 actions, generated from the computed results, not by the model.
- "Anforderungen und Belege" becomes a grouped list, one row per requirement, with a chip per applicable dimension. Expanding a row shows the explanation, citations, corrections and clarify actions.

**Projects list:** a compact assessment cell with four small values (T, F n/m, E, Ö) and flags for blockers, unverified mandatory requirements and evidence gaps. Legacy projects show "Altbewertung 8/10" and dimensions as not assessed.

**CV page:** an evidence panel with gaps and suggestions, each with "Übernehmen" (apply) or "Zur Referenz" (go to the reference), and the missing profile data with links to Experience.

**Editor:** a "Konditionen" fieldset.

**Experience reference editor:** a skill-usage control (select skills → "für das ganze Engagement bestätigen", confirm for the whole engagement; optional own period; "unknown").

**Economic preferences:** a "Konditionen & Präferenzen" section on the Experience page, saved through the separate preferences API.

## Risks / Trade-offs

- **The 14B model mis-splits or mis-categorises requirements** → schema enums; fallback to the existing required/preferred lines; the person can edit the requirement list (the editor keeps the required/preferred textareas, and the extraction reruns when they change).
- **Longer assessments on CPU** → extraction is cached; call 2 only covers technical-dimension requirements; the existing queue position and cancel UI stay.
- **Skill name matching misses aliases** (e.g. "K8s" vs "Kubernetes") → a small alias table in `shared/src/skills.ts` plus the model's cited labels. Misses degrade to `unverified` or `unknown`, never to a false `fulfilled`.
- **Strict formal rules produce many Unverified results for people who never confirm usage** → bulk confirmation per engagement; Unverified mandatory items are shown as risks with one-click clarify actions; nothing becomes Not fulfilled without a stated fact.
- **Computed-on-read results could differ between server and browser** → the same shared pure functions; tests run against shared.
- **Snapshot size grows** → only the compact computed view is frozen, not the inputs.

## Migration Plan

1. Ship the shared engines and tests (no behaviour change).
2. Ship the server assessment, `assessment` storage and preferences API next to the legacy fit. Old projects keep showing their legacy fit.
3. Switch the UI. A reassessment writes `assessment`; `fit` is left untouched for history.
4. Remove the legacy findings correction route and the fit-only UI paths.

**Rollback:** the previous build ignores `assessment` and keeps working with `fit`.
