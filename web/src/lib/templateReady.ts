import type { OutputTemplateProfile } from "../types/contracts";

export function isCustomTemplateReady(profile: OutputTemplateProfile | null): boolean {
  if (!profile || profile.builtin) return false;
  if (!profile.base_xlsx_b64) return false;
  if (!Number.isInteger(profile.data_start_row) || profile.data_start_row < 1) return false;
  return Object.values(profile.columns).some((field) => field != null);
}
