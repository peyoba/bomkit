/**
 * Profile localStorage CRUD + 指纹复用判断 + 导入导出。见契约第 3、4 节。
 * localStorage key 规则：bomkit.profile.{kind}.{uuid}（契约第 3 节）。
 */
import { fingerprint, jaccardSimilarity } from "./fingerprint";
import type { InputProfile, OutputTemplateProfile, Profile, ProfileKind } from "../types/contracts";

const KEY_PREFIX = "bomkit.profile";

function storageKey(kind: ProfileKind, id: string): string {
  return `${KEY_PREFIX}.${kind}.${id}`;
}

function isLocalStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveProfile(profile: Profile): void {
  if (!isLocalStorageAvailable()) return;
  window.localStorage.setItem(storageKey(profile.kind, profile.id), JSON.stringify(profile));
}

export function deleteProfile(kind: ProfileKind, id: string): void {
  if (!isLocalStorageAvailable()) return;
  window.localStorage.removeItem(storageKey(kind, id));
}

export function listProfiles(kind: ProfileKind): Profile[] {
  if (!isLocalStorageAvailable()) return [];
  const prefix = `${KEY_PREFIX}.${kind}.`;
  const result: Profile[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      result.push(JSON.parse(raw) as Profile);
    } catch {
      // 忽略损坏的条目，不阻断其余 Profile 的加载。
    }
  }
  return result;
}

export function exportProfile(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}

export function importProfile(json: string): Profile {
  const parsed = JSON.parse(json) as Profile;
  if (parsed.schema_version !== 1) {
    throw new Error(`不支持的 Profile 版本: ${parsed.schema_version}`);
  }
  return parsed;
}

export interface ProfileMatch {
  profile: InputProfile;
  similarity: number;
  exact: boolean;
}

/** 契约 4.3 复用策略：精确命中优先；否则找 Jaccard >= 0.8 的相似配置推荐。 */
export async function findMatchingProfile(
  kind: "bom_input" | "material_input",
  headers: string[]
): Promise<ProfileMatch | null> {
  const candidates = listProfiles(kind) as InputProfile[];
  if (candidates.length === 0) return null;

  const targetFingerprint = await fingerprint(headers);
  const exact = candidates.find((p) => p.header_fingerprint === targetFingerprint);
  if (exact) {
    return { profile: exact, similarity: 1, exact: true };
  }

  let best: ProfileMatch | null = null;
  for (const profile of candidates) {
    const profileHeaders = Object.keys(profile.column_map);
    const similarity = jaccardSimilarity(headers, profileHeaders);
    if (similarity >= 0.8 && (!best || similarity > best.similarity)) {
      best = { profile, similarity, exact: false };
    }
  }
  return best;
}

export function isOutputTemplateProfile(profile: Profile): profile is OutputTemplateProfile {
  return profile.kind === "output_template";
}
