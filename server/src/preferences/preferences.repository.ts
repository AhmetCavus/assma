import {
  DEFAULT_ECONOMIC_PREFERENCES,
  economicPreferencesSchema,
  type EconomicPreferences,
  type StoredPreferences,
} from "@assma/shared";
import PreferencesModel, { type PreferencesRecord } from "../models/preferences.model.js";

function toPreferences(record: PreferencesRecord | null): StoredPreferences {
  // Stored preferences that no longer match the contract fall back to the defaults.
  const parsed = economicPreferencesSchema.safeParse(record?.economic ?? {});
  return {
    economic: parsed.success ? parsed.data : DEFAULT_ECONOMIC_PREFERENCES,
    updatedAt: record ? record.updatedAt.toISOString() : null,
  };
}

export async function findPreferences(ownerId: string): Promise<StoredPreferences> {
  return toPreferences(
    await PreferencesModel.model.findOne({ ownerId }).lean<PreferencesRecord | null>(),
  );
}

export async function saveEconomic(
  ownerId: string,
  economic: EconomicPreferences,
): Promise<StoredPreferences> {
  const record = await PreferencesModel.model
    .findOneAndUpdate(
      { ownerId },
      { ownerId, economic, updatedAt: new Date() },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    .lean<PreferencesRecord>();
  return toPreferences(record);
}
