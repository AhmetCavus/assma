import type { ExperienceReference, SkillUsagePeriod, YearMonth } from "./experience.js";
import { coveredMonths, currentMonth, monthIndex, type MonthPeriod } from "./skills.js";
import { skillMatches } from "./terms.js";

/**
 * How long a skill was used, from the references that list it. Confirmed and assumed
 * periods are kept apart: only confirmed months can satisfy a formal duration requirement.
 * Every calendar month counts once, however many engagements overlap in it.
 */

export type UsageReference = Pick<
  ExperienceReference,
  "id" | "start" | "end" | "skills" | "skillUsage"
>;

export type ReferenceUsage = {
  referenceId: string;
  usage: "confirmed" | "assumed" | "unknown";
  /** The listed skill that matched, or null for a cited reference that does not list it. */
  skill: string | null;
};

export type UsageSummary = {
  /** Months confirmed by the person, each month once. */
  confirmedMonths: number;
  /** Confirmed and assumed months together, each month once. */
  possibleMonths: number;
  /** References where the skill was used at an unknown time. */
  unknownCount: number;
  references: ReferenceUsage[];
};

function engagementOf(reference: UsageReference, today: YearMonth): MonthPeriod {
  const start = monthIndex(reference.start);
  return { start, end: Math.max(start, monthIndex(reference.end ?? today)) };
}

function periodOf(
  period: Exclude<SkillUsagePeriod, "engagement" | "unknown">,
  today: YearMonth,
): MonthPeriod {
  const start = monthIndex(period.start);
  return { start, end: Math.max(start, monthIndex(period.end ?? today)) };
}

/**
 * The usage of a skill named by any of `terms`. `cited` adds references the assessment
 * attributes to the requirement although they do not list the skill; those count as assumed.
 */
export function usageOf(
  terms: readonly string[],
  references: readonly UsageReference[],
  options: { today?: YearMonth; cited?: readonly string[] } = {},
): UsageSummary {
  const today = options.today ?? currentMonth();
  const cited = new Set(options.cited ?? []);
  const confirmed: MonthPeriod[] = [];
  const possible: MonthPeriod[] = [];
  const result: ReferenceUsage[] = [];
  let unknownCount = 0;

  for (const reference of references) {
    const listed = reference.skills.filter((skill) =>
      terms.some((term) => skillMatches(skill, term)),
    );
    if (listed.length === 0) {
      if (cited.has(reference.id)) {
        possible.push(engagementOf(reference, today));
        result.push({ referenceId: reference.id, usage: "assumed", skill: null });
      }
      continue;
    }
    // Several listed spellings ("GitLab", "GitLab CI") count as one skill on this reference.
    let best: ReferenceUsage["usage"] = "assumed";
    let matched = listed[0]!;
    for (const skill of listed) {
      const entry = reference.skillUsage.find(
        (usage) => usage.skill.toLowerCase() === skill.toLowerCase(),
      );
      if (!entry) {
        continue;
      }
      if (entry.period === "unknown") {
        if (best === "assumed") {
          best = "unknown";
          matched = skill;
        }
        continue;
      }
      const period =
        entry.period === "engagement"
          ? engagementOf(reference, today)
          : periodOf(entry.period, today);
      confirmed.push(period);
      possible.push(period);
      best = "confirmed";
      matched = skill;
    }
    if (best === "assumed") {
      possible.push(engagementOf(reference, today));
    } else if (best === "unknown") {
      unknownCount += 1;
    }
    result.push({ referenceId: reference.id, usage: best, skill: matched });
  }

  return {
    confirmedMonths: coveredMonths(confirmed),
    possibleMonths: coveredMonths(possible),
    unknownCount,
    references: result,
  };
}
