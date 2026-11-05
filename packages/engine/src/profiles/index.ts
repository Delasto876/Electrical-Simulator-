import { NEC_GENERIC } from "./necGeneric";
import type { CodeProfile } from "./types";

export type { CodeProfile } from "./types";
export { NEC_GENERIC } from "./necGeneric";

/** Profiles shipped with the app. IEC-generic and Jamaica arrive with string sizing (TODO.md). */
export const CODE_PROFILES: readonly CodeProfile[] = [NEC_GENERIC];
export const DEFAULT_CODE_PROFILE = NEC_GENERIC;

export function getCodeProfile(id: string): CodeProfile | undefined {
  return CODE_PROFILES.find((p) => p.id === id);
}
