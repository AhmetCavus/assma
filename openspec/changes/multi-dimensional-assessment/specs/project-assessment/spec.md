# Spec Delta

## Purpose

Assess a captured project in four independent dimensions — Technical Fit, Formal Fit, Evidence and Economic Fit — so the freelancer can tell real skill gaps from formal blockers, undocumented experience, documentation gaps in the CV and unattractive conditions, and tailor a truthful CV.

## ADDED Requirements

### Requirement: Listings are split into individually assessable requirements

An assessment SHALL extract requirements from the listing. Each has original text, normalised text, a category, mandatory/optional, optional minimum duration in months, optional level, and the dimensions it applies to. Compound requirements SHALL be split into single requirements that keep their AND/OR grouping.

#### Scenario: Compound technologies are split

- **WHEN** a listing asks for "Experience with Kotlin, Coroutines and Jetpack Compose"
- **THEN** Kotlin, Coroutines and Jetpack Compose are three requirements in one AND group
- **AND** each keeps the original sentence as its source text

#### Scenario: Alternatives keep OR semantics

- **WHEN** a listing asks for "GitLab CI or GitHub Actions"
- **THEN** both are requirements in one OR group
- **AND** the group is satisfied by its best alternative, never by requiring both

#### Scenario: Categories and dimensions

- **WHEN** requirements name a degree, a certificate, a spoken language, a methodology, a rate or a remote share
- **THEN** they are categorised as education, certification, language, methodology or contract/economic conditions
- **AND** education, certification and language requirements are assessed against the matching profile section, not against project references

### Requirement: Model output is validated and never invents candidate data

Model answers for extraction and technical judgement SHALL be validated against a schema and normalised. Unknown references, invalid states and malformed answers SHALL be dropped or degraded to Unknown. No assessment SHALL add experience, skills, qualifications or periods that are not in the candidate data.

#### Scenario: Invalid model answer

- **WHEN** the model returns broken JSON, an unknown state, a reference label that does not exist or skips a requirement
- **THEN** the affected requirement becomes Unknown with no references
- **AND** the assessment still completes and the other requirements keep their results

#### Scenario: Model claims unsupported evidence

- **WHEN** the model marks a requirement as a direct match without citing an existing reference, education, language or certificate entry
- **THEN** the result is stored as Unknown, not as a match

### Requirement: Technical Fit rates the ability to do the work

Technical Fit SHALL rate each technical requirement as Direct match, Transferable match, Partial match, Skill gap or Unknown, give an onboarding effort for transferable and partial matches, and cite the supporting candidate data. The 0–10 score SHALL be computed by the application from the states, with mandatory requirements weighted double.

#### Scenario: Transferable experience

- **WHEN** a listing asks for GitLab CI/CD and the candidate's references show Azure DevOps pipelines
- **THEN** the requirement is a Transferable match with an onboarding effort and the Azure DevOps reference cited

#### Scenario: Related field is not expertise

- **WHEN** a listing asks for Machine Learning and the candidate only has general software engineering experience
- **THEN** the requirement is a Skill gap or Unknown, never a Direct or Transferable match

#### Scenario: Unknown is not missing

- **WHEN** some requirements are Unknown
- **THEN** they are excluded from the score
- **AND** the share that could be assessed is shown as coverage next to the score, not inside it

### Requirement: Missing documentation is not missing experience

A requirement that appears nowhere in the candidate data SHALL be Unknown for Technical Fit and Unverified for Formal Fit, unless other verified data supports a technical judgement. A Skill gap SHALL only be set by the person or when verified data supports it. Each such requirement SHALL offer an action to clarify or supplement the data.

#### Scenario: Undocumented skill

- **WHEN** a mandatory requirement asks for Terraform and Terraform appears in no reference, profile entry or skill list
- **THEN** Technical Fit is Unknown and Formal Fit is Unverified
- **AND** it is shown as a potential eligibility risk with an action to add or deny the experience

#### Scenario: Person denies the experience

- **WHEN** the person states that they have no Terraform experience
- **THEN** Technical Fit becomes Skill gap and Formal Fit becomes Not fulfilled for that requirement
- **AND** the statement is kept across reassessments

### Requirement: Formal Fit checks explicit eligibility strictly

Formal Fit SHALL mark each eligibility requirement as Fulfilled, Unverified, Not fulfilled or Not applicable, decided by the application. Not fulfilled SHALL only follow from an explicit statement by the person, verified and complete data below the threshold, or a contradicting confirmed fact. Transferable skills SHALL NOT fulfil a formal requirement.

#### Scenario: Duration shortfall with confirmed complete data

- **WHEN** 36 months of mandatory GitLab experience are required, the confirmed usage covers 30 months and the person has confirmed this is all their GitLab experience
- **THEN** Formal Fit reports required 36, available 30, gap 6 and Not fulfilled as a blocker
- **AND** Technical Fit for GitLab may still be a Direct match

#### Scenario: Duration shortfall with incomplete data

- **WHEN** the same 30 confirmed months are documented but completeness is not confirmed
- **THEN** Formal Fit is Unverified with required 36, documented 30 and gap 6 shown as a potential risk
- **AND** an action lets the person add experience or confirm that the data is complete

#### Scenario: Contradicting confirmed fact

- **WHEN** English C1 is required and the profile lists English at B2
- **THEN** the requirement is Not fulfilled with both levels shown

#### Scenario: Education comes from the education profile

- **WHEN** a completed university degree is required and the profile lists a finished degree
- **THEN** the requirement is Fulfilled with the education entry cited, without any project reference

#### Scenario: Missing certificate

- **WHEN** a certificate is required and the profile does not list it
- **THEN** the requirement is Unverified, not Not fulfilled

### Requirement: Formal Fit is summarised without a 0–10 score

Formal Fit SHALL show fulfilled and total mandatory requirements, unverified mandatory requirements as potential risks, blockers and explicit duration gaps. A mandatory Not fulfilled requirement SHALL remain visible as a blocker regardless of the other dimensions.

#### Scenario: Summary

- **WHEN** 10 mandatory requirements are assessed with 7 fulfilled, 2 unverified and 1 not fulfilled
- **THEN** Formal Fit shows 7 of 10 fulfilled, 2 unverified and 1 blocker with its reason

### Requirement: Usage periods are confirmed, assumed or unknown

For each skill on a reference, usage SHALL be confirmed (for the whole engagement or a stated period), assumed (listed but not confirmed) or unknown. The person SHALL be able to confirm several skills of one reference for the whole engagement in one action. A separate period SHALL only be needed when it differs from the engagement.

#### Scenario: Confirm several skills at once

- **WHEN** the person confirms Kotlin, Compose and Room for the whole Juniper Health engagement in one action
- **THEN** all three count as confirmed for that engagement's period

#### Scenario: Assumed period does not satisfy a duration

- **WHEN** a reference from 2019 to 2023 lists GitLab without confirmed usage and 36 months are required
- **THEN** the requirement is Unverified with the assumed months shown and an action to confirm usage

### Requirement: Experience durations count each month once

Durations SHALL be calculated from usage periods of the references that list the technology, counting each calendar month once. Confirmed and assumed months SHALL be reported separately. Only confirmed months SHALL fulfil a duration requirement.

#### Scenario: Overlapping projects count once

- **WHEN** two references with confirmed Kotlin usage cover January 2022–December 2022 and July 2022–June 2023
- **THEN** Kotlin counts 18 confirmed months, not 24

#### Scenario: Stated period beats the engagement

- **WHEN** a reference runs 2020–2023 and GitLab usage is confirmed for 2022 only
- **THEN** GitLab counts 12 confirmed months from that reference

### Requirement: Evidence Score rates how well existing competencies are shown in the CV

Evidence SHALL compare the requirements, the candidate data and the project's CV, and mark each requirement with existing supporting data as Fully evidenced, Partially evidenced, Missing evidence or Unknown. The 0–10 score, its coverage and the number of actionable gaps SHALL be computed by the application.

#### Scenario: Existing but undocumented experience

- **WHEN** Scrum appears in a reference that is not selected for the CV
- **THEN** Scrum is Missing evidence with that reference cited and a suggestion to include it

#### Scenario: Keywords missing for documented work

- **WHEN** accessibility work is documented but the required keywords TalkBack and Compose Semantics appear nowhere in the CV
- **THEN** the requirement is Partially evidenced with the missing keywords named

### Requirement: Missing profile data is separate from missing CV evidence

A requirement without any supporting candidate data SHALL be reported as missing profile data with an action to supplement the profile, not as a CV evidence gap. It SHALL not count in the Evidence Score or its gaps.

#### Scenario: Genuine or undocumented gap

- **WHEN** a requirement has no supporting data in references, profile, education, languages or certificates
- **THEN** it is listed under missing profile data
- **AND** Evidence suggests no CV wording for it

### Requirement: Evidence needs a CV

When the project has no generated or selected CV, the CV-specific Evidence Score SHALL be shown as not yet available with an action to create the CV. Missing profile data SHALL still be shown.

#### Scenario: No CV yet

- **WHEN** a project has been assessed but no CV draft exists
- **THEN** the Evidence card shows "not available yet" and the action to create the CV instead of a score

### Requirement: Evidence suggestions are reviewed by the person and never fabricate facts

Each documentation gap SHALL carry the missing evidence, an explanation, the existing data it rests on and a suggested CV improvement. Suggestions SHALL only select, order or reword existing candidate data. The person SHALL approve a suggestion before the CV changes.

#### Scenario: No invented content

- **WHEN** a requirement has no supporting candidate data
- **THEN** no suggestion adds that skill, period or qualification to the CV

#### Scenario: Approved suggestion

- **WHEN** the person approves "add reference Juniper Health to the CV"
- **THEN** the reference is added to the CV draft and Evidence is recalculated

### Requirement: Evidence is recalculated when the CV changes

Evidence SHALL be recalculated without a model run whenever the project CV draft is generated, edited or saved. Technical and Formal Fit SHALL NOT change because of CV content.

#### Scenario: Better CV, same capability

- **WHEN** the person adds a missing reference to the CV
- **THEN** the Evidence Score rises
- **AND** Technical Fit and Formal Fit stay exactly the same

### Requirement: Economic Fit rates the project against personal preferences

Economic Fit SHALL score the project's conditions against the person's economic preferences, return a 0–10 score with coverage shown separately, attractive, unfavourable and unknown conditions, open questions and triggered exclusions. Unknown conditions SHALL lower coverage, not the score.

#### Scenario: Unknown compensation is not penalised

- **WHEN** the listing states no rate
- **THEN** compensation is reported as unknown and as an open question
- **AND** the score is computed from the remaining known conditions with reduced coverage

#### Scenario: Exclusion criterion

- **WHEN** the person excludes projects below 60 % remote and the project offers 20 %
- **THEN** the exclusion is shown explicitly next to the score

### Requirement: Project conditions are structured and editable

The project SHALL hold structured conditions — compensation amount, unit and currency, contract type, remote share, duration, weekly hours, start, on-site location and travel — suggested from the listing and editable by the person. Unstated conditions SHALL remain unknown.

#### Scenario: Suggested conditions are reviewed

- **WHEN** a listing says "Remote 80 %, 6 Monate, Vollzeit, Start 01.01.2027"
- **THEN** remote 80, duration 6 months, 40 hours and the start date are suggested and editable
- **AND** an unstated rate stays unknown

### Requirement: The four dimensions are independent

There SHALL be no overall score. Economic preferences and project conditions SHALL only affect Economic Fit, CV changes only Evidence, and experience data changes only the dimensions that read it. None of these SHALL start a model run; only a reassessment does.

#### Scenario: Preferences change

- **WHEN** the person changes the remote weight or the target rate
- **THEN** Economic Fit is recalculated immediately
- **AND** Technical, Formal and Evidence results are unchanged and no model run starts

#### Scenario: Usage confirmed

- **WHEN** the person confirms GitLab usage for an engagement
- **THEN** Formal Fit and Evidence are recalculated without a model run

### Requirement: Results are traceable and correctable

Each requirement result SHALL show its explanation and the candidate data it rests on. The person SHALL be able to correct a result per dimension. Corrections and confirmed facts SHALL survive reassessments until the person resets them.

#### Scenario: Correction survives reassessment

- **WHEN** the person sets a requirement from Partial to Direct match with a cited reference and later reassesses
- **THEN** the corrected result is kept and marked as corrected
- **AND** a reset restores the new model result

### Requirement: The project overview shows all four dimensions

The project list SHALL show Technical, Formal, Evidence and Economic compactly per project, with formal blockers, unverified mandatory requirements and actionable evidence gaps visible at a glance. A project not yet reassessed SHALL show its previous score labelled as a legacy assessment, never as Technical Fit.

#### Scenario: Assessed project

- **WHEN** a project has a new assessment with one blocker and two evidence gaps
- **THEN** its row shows the four values and the blocker and gap counts

#### Scenario: Legacy project

- **WHEN** a project only has the previous fit score 8
- **THEN** its row shows 8 labelled as the legacy assessment and the dimensions as not assessed

### Requirement: Earlier assessments and submissions stay readable

Existing projects with the previous single fit score and existing application snapshots SHALL remain readable. A project shows its previous fit until it is reassessed. Snapshots keep what was frozen at submission.

#### Scenario: Project assessed before the change

- **WHEN** a project only has the previous fit
- **THEN** its page shows that result marked as the legacy assessment with an action to reassess
- **AND** no data is lost or rewritten until the person reassesses

#### Scenario: Application submitted before the change

- **WHEN** an application's snapshot holds the previous fit
- **THEN** the application page shows it unchanged
