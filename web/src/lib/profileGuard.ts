import { v4 as uuidv4 } from "uuid";
import type { Profile } from "../types/contracts";
import { saveProfile as saveProfileRaw } from "./profiles";

export function isBuiltinProfile(profile: Pick<Profile, "id" | "builtin">): boolean {
  return profile.builtin === true || profile.id.startsWith("builtin-");
}

export function copyProfile<T extends Profile>(profile: T, newName?: string): T {
  const cloned = structuredClone(profile);
  cloned.id = uuidv4();
  cloned.name = newName ?? `${profile.name}（副本）`;
  cloned.builtin = false;
  return cloned;
}

export function saveProfileGuarded(profile: Profile): void {
  if (isBuiltinProfile(profile)) {
    throw new Error("内置配置不可覆盖，请复制后另存");
  }
  saveProfileRaw(profile);
}
