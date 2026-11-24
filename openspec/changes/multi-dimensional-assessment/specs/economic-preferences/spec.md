# Spec Delta

## Purpose

Let the freelancer state what makes a project economically attractive to them — compensation, remote share, contract type, duration, workload and travel — and which conditions exclude a project, kept separate from their professional experience, so Economic Fit reflects their own priorities.

## ADDED Requirements

### Requirement: Preferences are personal and separate from experience

Each account SHALL have economic preferences that only its owner can read and change. They SHALL be stored and edited separately from the professional profile and references, even when shown on the same page.

#### Scenario: Another account

- **WHEN** another account requests or changes these preferences
- **THEN** it sees and changes only its own preferences

#### Scenario: Editing experience

- **WHEN** the person saves their profile or a reference
- **THEN** their economic preferences are unchanged, and the reverse holds as well

### Requirement: Preferences have targets, acceptable ranges and exclusions

For each criterion the person SHALL be able to set a target, an acceptable range and optionally a hard exclusion. A value at the target SHALL score fully, a value inside the acceptable range SHALL score partially, a value outside it SHALL score zero, and an exclusion SHALL be reported separately.

#### Scenario: Remote share in range

- **WHEN** the target remote share is 100 %, the acceptable minimum 50 % and the project offers 80 %
- **THEN** the remote criterion scores between zero and full

#### Scenario: Excluded contract type

- **WHEN** employment contracts are excluded and a project is an employment contract
- **THEN** Economic Fit lists the exclusion alongside the score instead of hiding it in the score

### Requirement: Freelance rates and employment salaries are evaluated separately

Freelance compensation SHALL be compared with freelance rate preferences only, and employment compensation with salary preferences only. A salary SHALL be compared at the project's weekly hours by pro-rating the salary target set for the person's reference weekly hours.

#### Scenario: Part-time salary

- **WHEN** the salary target is 90,000 for 40 hours and the project offers 60,000 for 30 hours
- **THEN** the offer is compared with a pro-rated target of 67,500

#### Scenario: No cross comparison

- **WHEN** the project is an employment contract
- **THEN** the freelance rate preferences are not used

### Requirement: Unknown conditions stay unknown

A condition the project does not state SHALL be reported as unknown and as an open question. It SHALL NOT lower the score. Weights SHALL be normalised over the criteria whose condition is known, and coverage SHALL show the known share of the weight.

#### Scenario: Unknown compensation

- **WHEN** compensation is unknown for a project
- **THEN** the remaining weights are scaled to 100 % for the score
- **AND** coverage shows the share of weight that could be assessed

#### Scenario: Unknown hours for a salary

- **WHEN** an employment project states a salary but no weekly hours
- **THEN** workload is unknown and the salary is compared at the person's reference hours with an open question about the hours

### Requirement: Default preferences apply until configured

Until the person saves preferences, the initial weights SHALL apply: compensation 30 %, remote 25 %, contract type 20 %, duration 10 %, workload 10 %, travel 5 %. A criterion without a configured target SHALL be reported as not configured rather than scored.

#### Scenario: Not configured yet

- **WHEN** the person has never saved preferences
- **THEN** Economic Fit uses the initial weights and states that compensation targets are not set

### Requirement: Changing preferences only recalculates Economic Fit

Saving preferences SHALL recalculate Economic Fit without a model run and SHALL leave Technical Fit, Formal Fit and Evidence unchanged.

#### Scenario: Target rate raised

- **WHEN** the person raises the freelance target rate
- **THEN** Economic Fit of a project with a known rate below the target drops
- **AND** no assessment job is started
