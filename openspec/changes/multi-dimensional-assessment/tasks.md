# Tasks

## 1. Shared domain and deterministic engines

- [x] 1.1 Add the assessment contract in `shared/src/assessment.ts`: requirement groups/requirements, categories, dimensions, Technical/Formal/Evidence states, onboarding, corrections, stored `assessment` (version 2) with read-time validation. Verify: unit tests parse valid data and degrade invalid data (unknown states → unknown, unknown citations dropped).
- [x] 1.2 Add skill usage (`engagement` / own period / `unknown`; absent = assumed) to the reference contract with a bulk-confirm helper, and skill facts (`complete` / `none`) to the experience contract. Verify: tests for valid/invalid periods (inside the engagement); existing references without usage still parse; bulk confirm sets several skills at once.
- [x] 1.3 Implement per-skill durations (confirmed vs confirmed+assumed merged months, unknown count) with alias matching. Verify tests: overlapping confirmed periods count 18 not 24; a stated period beats the engagement; assumed months are reported but separately.
- [x] 1.4 Implement Technical scoring with AND/OR groups, group weights, separate coverage, the citation rule and the gap rule. Verify tests: OR takes the best alternative; unknown is excluded from the score and lowers coverage; a direct match without a citation → unknown; an uncited gap → unknown; skill fact `none` → gap.
- [x] 1.5 Implement Formal Fit per design 5 and its summary (fulfilled/total mandatory, unverified mandatory risks, blockers, duration gaps, clarify actions). Verify tests: GitLab 30 vs 36 confirmed + `complete` → not fulfilled, gap 6, while Technical stays direct; without `complete` → unverified with gap 6; assumed-only → unverified; an undocumented skill → unverified (Technical unknown); a degree from education; English B2 vs C1 → not fulfilled; a missing certificate → unverified; transferable never fulfils; a correction wins.
- [x] 1.6 Implement `cvPlainText` and Evidence (states, score, separate coverage, gap count, availability without a CV, missing profile data list, typed suggestions over existing data only). Verify tests: an unselected reference → missing with `select_reference`; no supporting data → missing profile data, not a gap, no suggestion; missing keywords → partial; no CV → not available; adding the reference raises Evidence while Technical and Formal are unchanged.
- [x] 1.7 Add project `conditions` (projects contract) and a separate `shared/src/preferences.ts` (targets, acceptable ranges, exclusions, freelance vs employment with reference hours, defaults 30/25/20/10/10/5), and implement Economic Fit. Verify tests: an unknown rate is not penalised (coverage drops); salary is pro-rated by hours (90k@40h vs 60k@30h → target 67.5k) and never compared with the freelance rate; unknown hours → open question; not-configured criteria are excluded; exclusions are listed separately; a preference change alters only Economic.
- [x] 1.8 Add an independence test: one fixture assessed; then CV, preferences, conditions and usage confirmation changed one at a time; only the expected dimensions change. Verify: `npm test` green, type check green.

## 2. Server: extraction, technical judgement and storage

- [x] 2.1 Write the extraction prompt and schema (groups, requirements, categories, months, level, conditions) with fencing against prompt injection, plus normalisation with a fallback to the required/preferred lines. Verify: unit tests with broken JSON, unknown enums, an empty answer and an injection text in the listing.
- [x] 2.2 Write the technical judgement prompt and schema citing E/P/D/C labels for references, profile, education and certificates, plus normalisation. Verify: unit tests for unknown labels → unknown, skipped requirements, broken JSON.
- [x] 2.3 Build the assessment service on the existing queue: cached extraction by fingerprint, call 2, store `assessment`, keep `fit`, apply corrections after reassessment. Verify: tests with a stubbed provider (extraction cached on a second run; corrections kept; the runaway guard handled).
- [x] 2.4 Add the API: correction set/reset, conditions update, `GET`/`PUT` economic preferences (owner-scoped, separate collection), skill usage on references, skill facts; computed dimensions in project responses. Verify: route tests for owner scoping and validation errors; a preference change or usage confirmation starts no model job; corrections and skill facts survive a reassessment.
- [x] 2.5 Add conditions to the listing reader schema and normalisation. Verify: tests that remote/duration/hours/start are parsed and unstated fields stay null.
- [x] 2.6 Extend the application snapshot with the optional computed assessment, and the assistant context with the four dimensions. Verify: tests that old snapshots still parse; the assistant context lists blockers and gaps.

## 3. Web

- [ ] 3.1 Fit page: four cards with coverage shown separately, Evidence "not available yet" without a CV, an action summary, grouped requirements with per-dimension chips, details, citations, clarify actions and correction/reset; a legacy fit is labelled as the legacy assessment. Locales in DE/EN. Verify: browser test against the local model (assess, correct, reassess keeps the correction, reset), light/dark, 390 px with no horizontal scroll.
- [ ] 3.2 CV page: evidence panel with live recalculation and approve-to-apply suggestions. Verify: browser test where adding a suggested reference raises Evidence and leaves the other cards unchanged.
- [ ] 3.3 Project editor: conditions fieldset with suggested values. Experience: skill-usage control (bulk confirm for the engagement, own period, unknown), skill facts from clarify actions, and the "Konditionen & Präferenzen" section (targets, ranges, exclusions). Verify: browser test that saving preferences updates Economic Fit without an assessment job, and bulk-confirming usage turns an Unverified duration into Fulfilled.
- [ ] 3.4 Projects list: compact four-dimension cell with blocker, unverified-mandatory and evidence-gap flags, legacy projects labelled "Altbewertung"; application snapshot view with the frozen four-dimension view. Verify: browser test with one legacy and one new project, one old and one new application, light/dark and 390 px.

## 4. Integration

- [ ] 4.1 Run type check, all tests, format check and builds. Then a full browser pass, from capture to assess, CV and apply, on the e2e stack against the notebook model, recording timings for extraction and judgement. Verify: commands green; screenshots in the scratchpad; findings reported.
- [ ] 4.2 Update README and `docs/assma-Concept.md` (the scoring section) to describe the four dimensions. Verify: `openspec validate multi-dimensional-assessment --strict` passes, and the docs match the shipped behaviour.

## Workflow follow-up

- Commit per task group after review; deploy only with explicit approval.
- Archive the change with `openspec archive multi-dimensional-assessment` once shipped, so the main specs are created.
