import { createCollection, Provider } from "yappio";

/**
 * What the person stated about skills across all engagements: that the documented
 * experience is complete, or that they have none. One document per account.
 */
export type SkillFactsRecord = {
  ownerId: string;
  facts: unknown[];
  updatedAt: Date;
};

export default createCollection<SkillFactsRecord>("AssmaSkillFacts").withSchema({
  ownerId: { ...Provider.String, required: true, unique: true },
  facts: { ...Provider.Mixed, default: [] },
  updatedAt: { ...Provider.Date, required: true },
});
