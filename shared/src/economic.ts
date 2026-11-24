import type { EconomicCriterion, EconomicPreferences } from "./preferences.js";
import { ECONOMIC_CRITERIA } from "./preferences.js";
import { TRAVEL_LEVELS, type ProjectConditions } from "./projects.js";

/**
 * Economic Fit: is the project attractive to this person? Computed from the project's
 * conditions and the person's preferences, never judged by the model. Unknown conditions and
 * criteria the person has not configured are left out of the score and lower the coverage
 * instead. Exclusions are reported next to the score, never hidden inside it.
 */

export type CriterionStatus = "scored" | "unknown" | "not_configured";

export type CriterionResult = {
  criterion: EconomicCriterion;
  status: CriterionStatus;
  /** 0–1 when scored. */
  value: number | null;
  weight: number;
  rating: "attractive" | "neutral" | "unfavourable" | null;
  /** For compensation: what was compared, in comparable units. */
  compared: { offer: number; target: number; unit: "hour" | "year"; currency: string } | null;
};

export type OpenQuestion = EconomicCriterion | "hours" | "contract_for_compensation";

export type Exclusion =
  | { kind: "rate"; offer: number; minimum: number }
  | { kind: "salary"; offer: number; minimum: number }
  | { kind: "remote"; offer: number; minimum: number }
  | { kind: "contract"; contract: string };

export type EconomicFit = {
  /** 0–10, or null when no criterion could be scored. */
  score: number | null;
  /** Share of the total weight that could be scored, 0–1. */
  coverage: number;
  criteria: CriterionResult[];
  attractive: EconomicCriterion[];
  unfavourable: EconomicCriterion[];
  unknown: EconomicCriterion[];
  notConfigured: EconomicCriterion[];
  openQuestions: OpenQuestion[];
  exclusions: Exclusion[];
};

const HOURS_PER_DAY = 8;
const WEEKS_PER_YEAR = 52;

/**
 * Higher is better: 1 at or above the best value, falling to 0.25 at the worst acceptable
 * value, 0 below it. Without a worst value, the score is the share of the best value.
 */
export function higherIsBetter(value: number, best: number, worst: number | null): number {
  if (value >= best) {
    return 1;
  }
  if (worst === null) {
    return best <= 0 ? 1 : Math.max(0, value / best);
  }
  if (value < worst) {
    return 0;
  }
  return best === worst ? 1 : 0.25 + (0.75 * (value - worst)) / (best - worst);
}

/** Lower is better: 1 up to the best value, falling to 0.25 at the worst acceptable, 0 above. */
export function lowerIsBetter(value: number, best: number | null, worst: number | null): number {
  if (best !== null && value <= best) {
    return 1;
  }
  if (worst === null) {
    return best === null ? 1 : 0;
  }
  if (value > worst) {
    return 0;
  }
  return best === null || best === worst ? 1 : 0.25 + (0.75 * (worst - value)) / (worst - best);
}

/** A freelance offer per hour. */
function hourlyOffer(compensation: NonNullable<ProjectConditions["compensation"]>): number {
  switch (compensation.unit) {
    case "hour":
      return compensation.amount;
    case "day":
      return compensation.amount / HOURS_PER_DAY;
    case "month":
      return compensation.amount / ((40 * WEEKS_PER_YEAR) / 12);
    case "year":
      return compensation.amount / (40 * WEEKS_PER_YEAR);
  }
}

/** An employment offer per year at the project's weekly hours. */
function annualOffer(
  compensation: NonNullable<ProjectConditions["compensation"]>,
  weeklyHours: number,
): number {
  switch (compensation.unit) {
    case "year":
      return compensation.amount;
    case "month":
      return compensation.amount * 12;
    case "day":
      return (compensation.amount * weeklyHours * WEEKS_PER_YEAR) / HOURS_PER_DAY;
    case "hour":
      return compensation.amount * weeklyHours * WEEKS_PER_YEAR;
  }
}

type Scored = Pick<CriterionResult, "status" | "value" | "compared">;
const unknown: Scored = { status: "unknown", value: null, compared: null };
const notConfigured: Scored = { status: "not_configured", value: null, compared: null };

export function economicFit(
  conditions: ProjectConditions,
  preferences: EconomicPreferences,
): EconomicFit {
  const openQuestions: OpenQuestion[] = [];
  const exclusions: Exclusion[] = [];

  function compensation(): Scored {
    const offer = conditions.compensation;
    if (!offer) {
      return unknown;
    }
    if (!conditions.contract) {
      // A rate and a salary are not comparable; without the contract type it stays open.
      openQuestions.push("contract_for_compensation");
      return unknown;
    }
    if (conditions.contract === "freelance") {
      const { target, minimum, unit, currency } = preferences.freelance;
      const perHour = (value: number) => (unit === "day" ? value / HOURS_PER_DAY : value);
      const hourly = hourlyOffer(offer);
      const { minimumRate } = preferences.exclusions;
      if (minimumRate !== null && hourly < perHour(minimumRate)) {
        exclusions.push({ kind: "rate", offer: hourly, minimum: perHour(minimumRate) });
      }
      if (target === null) {
        return notConfigured;
      }
      return {
        status: "scored",
        value: higherIsBetter(hourly, perHour(target), minimum === null ? null : perHour(minimum)),
        compared: { offer: hourly, target: perHour(target), unit: "hour", currency },
      };
    }
    // Employment and temporary employment: salaries, pro-rated by the weekly hours.
    const { target, minimum, currency, referenceHours } = preferences.employment;
    if (conditions.hoursPerWeek === null) {
      openQuestions.push("hours");
    }
    const weekly = conditions.hoursPerWeek ?? referenceHours;
    const scale = weekly / referenceHours;
    const annual = annualOffer(offer, weekly);
    const { minimumSalary } = preferences.exclusions;
    if (minimumSalary !== null && annual < minimumSalary * scale) {
      exclusions.push({ kind: "salary", offer: annual, minimum: minimumSalary * scale });
    }
    if (target === null) {
      return notConfigured;
    }
    return {
      status: "scored",
      value: higherIsBetter(annual, target * scale, minimum === null ? null : minimum * scale),
      compared: { offer: annual, target: target * scale, unit: "year", currency },
    };
  }

  function remote(): Scored {
    if (conditions.remote === null) {
      return unknown;
    }
    const { minimumRemote } = preferences.exclusions;
    if (minimumRemote !== null && conditions.remote < minimumRemote) {
      exclusions.push({ kind: "remote", offer: conditions.remote, minimum: minimumRemote });
    }
    const { target, minimum } = preferences.remote;
    if (target === null) {
      return notConfigured;
    }
    return {
      status: "scored",
      value: higherIsBetter(conditions.remote, target, minimum),
      compared: null,
    };
  }

  function contract(): Scored {
    if (conditions.contract === null) {
      return unknown;
    }
    if (preferences.exclusions.contracts.includes(conditions.contract)) {
      exclusions.push({ kind: "contract", contract: conditions.contract });
    }
    const { preferred, acceptable } = preferences.contracts;
    if (preferred.length === 0 && acceptable.length === 0) {
      return notConfigured;
    }
    const value = preferred.includes(conditions.contract)
      ? 1
      : acceptable.includes(conditions.contract)
        ? 0.5
        : 0;
    return { status: "scored", value, compared: null };
  }

  function duration(): Scored {
    const months = conditions.months;
    if (months === null) {
      return unknown;
    }
    const { minimum, target, maximum } = preferences.duration;
    if (minimum === null && target === null && maximum === null) {
      return notConfigured;
    }
    if (maximum !== null && months > maximum) {
      return { status: "scored", value: 0, compared: null };
    }
    if (target === null) {
      return {
        status: "scored",
        value: minimum !== null && months < minimum ? 0 : 1,
        compared: null,
      };
    }
    return { status: "scored", value: higherIsBetter(months, target, minimum), compared: null };
  }

  function workload(): Scored {
    if (conditions.hoursPerWeek === null) {
      return unknown;
    }
    const { target, maximum } = preferences.workload;
    if (target === null && maximum === null) {
      return notConfigured;
    }
    return {
      status: "scored",
      value: lowerIsBetter(conditions.hoursPerWeek, target, maximum),
      compared: null,
    };
  }

  function travel(): Scored {
    if (conditions.travel === null) {
      return unknown;
    }
    const { target, maximum } = preferences.travel;
    if (target === null && maximum === null) {
      return notConfigured;
    }
    const level = TRAVEL_LEVELS.indexOf(conditions.travel);
    const value =
      target !== null && level <= TRAVEL_LEVELS.indexOf(target)
        ? 1
        : maximum !== null && level <= TRAVEL_LEVELS.indexOf(maximum)
          ? 0.5
          : 0;
    return { status: "scored", value, compared: null };
  }

  const scorers: Record<EconomicCriterion, () => Scored> = {
    compensation,
    remote,
    contract,
    duration,
    workload,
    travel,
  };
  const criteria: CriterionResult[] = ECONOMIC_CRITERIA.map((criterion) => {
    const result = scorers[criterion]();
    const value = result.value;
    return {
      criterion,
      ...result,
      weight: preferences.weights[criterion],
      rating:
        value === null
          ? null
          : value >= 0.75
            ? "attractive"
            : value <= 0.35
              ? "unfavourable"
              : "neutral",
    };
  });

  const weighted = criteria.filter((entry) => entry.weight > 0);
  const scored = weighted.filter((entry) => entry.status === "scored");
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const scoredWeight = scored.reduce((sum, entry) => sum + entry.weight, 0);
  const points = scored.reduce((sum, entry) => sum + entry.weight * entry.value!, 0);
  const unknownCriteria = criteria
    .filter((entry) => entry.status === "unknown")
    .map((entry) => entry.criterion);
  for (const criterion of unknownCriteria) {
    openQuestions.unshift(criterion);
  }

  return {
    score: scoredWeight === 0 ? null : Math.round((10 * points) / scoredWeight),
    coverage: totalWeight === 0 ? 0 : scoredWeight / totalWeight,
    criteria,
    attractive: scored
      .filter((entry) => entry.rating === "attractive")
      .map((entry) => entry.criterion),
    unfavourable: scored
      .filter((entry) => entry.rating === "unfavourable")
      .map((entry) => entry.criterion),
    unknown: unknownCriteria,
    notConfigured: criteria
      .filter((entry) => entry.status === "not_configured")
      .map((entry) => entry.criterion),
    openQuestions: [...new Set(openQuestions)],
    exclusions,
  };
}
