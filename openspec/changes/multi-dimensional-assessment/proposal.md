# Proposal

## Why

assma's experience fit is one 1–10 score from weighted `confirmed / partial / missing` findings against project references only. It mixes three different things: whether the freelancer can do the work, whether they meet the listing's explicit eligibility rules, and whether their CV shows what they have. Education, languages, certificates and working conditions are not assessed at all. A low score therefore cannot tell a real skill gap from a missing CV line or a 6-month duration shortfall. And it says nothing about whether the project is worth taking.

## What Changes

- **Requirement extraction:** the listing is split into individually assessable requirements, each with:
  - original and normalised text;
  - category (technical skill, professional experience, domain, education, certification, language, methodology, leadership, contract/economic);
  - mandatory/optional;
  - minimum duration and level when stated;
  - the dimensions it applies to.

  Compound requirements are split, and AND/OR groups are preserved. The model interprets; application code validates the structure.

- **Technical Fit** (0–10, with coverage): states Direct / Transferable / Partial / Skill gap / Unknown, plus an onboarding effort, with references to the supporting candidate data. The model judges semantic relations; the score, the OR-group resolution and coverage are computed. Unknown is excluded from the score, not counted as missing.
- **Formal Fit** (no 0–10 score): Fulfilled / Unverified / Not fulfilled / Not applicable, decided in code wherever possible:
  - durations come from documented usage periods, with overlaps merged;
  - languages are compared against CEFR levels;
  - education is checked against completed education entries;
  - certificates against the certificate list.

  It shows fulfilled/total mandatory requirements, unverified requirements, blockers and explicit duration gaps. Transferable skills never compensate.

- **Evidence Score** (0–10, plus the number of actionable gaps): compares the requirements, the candidate data and the project's CV.
  - States: Fully / Partially / Missing evidence / Unknown, each with a suggested CV improvement that cites existing data.
  - It is computed deterministically, so it updates immediately when the CV changes.
  - A genuine gap stays a skill gap and is never turned into CV wording.
- **Economic Fit** (0–10, with coverage):
  - Structured project conditions are suggested from the listing and editable by the person: rate or salary, contract type, remote share, duration, workload, start, on-site, travel.
  - These are scored against configurable personal preferences: weights, separate freelance and employment compensation targets, and exclusion criteria.
  - Unknown conditions reduce coverage, not the score.
- **Optional usage periods per skill** on a reference. Without them, the reference period is used but marked as assumed, so a duration requirement met only by assumed periods stays Unverified.
- **Personal economic preferences:** a new settings section with initial weights 30/25/20/10/10/5.
- **UI:**
  - The single "Erfahrungspassung" card becomes four compact cards plus a short actionable summary.
  - "Anforderungen und Belege" shows the per-requirement results by dimension with explanations and references, and lets the person correct them. Corrections survive reassessment until explicitly reset.
  - The CV page shows the evidence gaps and suggestions to review and approve.
- **Independence:**
  - Changing preferences recalculates Economic Fit only.
  - Changing the CV recalculates Evidence only.
  - Neither starts a model run.
- **BREAKING (stored data):** projects get a new `assessment`; the old `fit` stays readable and is replaced on the next assessment. Application snapshots keep their frozen `fit` and add the new `assessment` for new submissions. No destructive migration.

## Capabilities

### New Capabilities

- `project-assessment`: requirement extraction and the four independent dimensions — Technical, Formal, Evidence, Economic — with corrections, coverage and traceability.
- `economic-preferences`: the person's compensation targets, weights and exclusion criteria, and how they are applied.

### Modified Capabilities

None. assma has no main specs yet; the existing fit behaviour is described in `docs/assma-Concept.md` and is superseded by `project-assessment`.

## Impact

- **Shared contracts:**
  - `shared/src/fit.ts`: the legacy fit is kept for reading;
  - a new `assessment` module;
  - `projects.ts`: conditions;
  - `experience.ts`: skill usage periods;
  - `applications.ts`: the snapshot;
  - a new preferences contract.
- **Server:**
  - `projects/fit.*` becomes an assessment service with extraction and technical prompts behind the existing `inference()` abstraction and model queue;
  - repositories;
  - a preferences repository and routes;
  - the assistant context.
- **Web:**
  - `ProjectFitPage` (cards, requirement list, corrections);
  - `ProjectCvPage` (evidence panel);
  - `ProjectEditorPage` (conditions);
  - Experience reference editor (usage periods);
  - a preferences page or section;
  - the projects list (score column), application snapshot view, locales.
- **Model load:** two structured calls per assessment (extraction, cached by listing fingerprint; technical judgement) instead of one. On the shared notebook GPU this is about 20–60 s; on the CPU fallback several minutes, still inside the existing queue and polling.
- **Out of scope:** an overall score, CV auto-writing of facts, new providers or frameworks, redesign of other pages.
