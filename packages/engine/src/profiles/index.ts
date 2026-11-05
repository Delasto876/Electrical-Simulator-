import { JAMAICA } from "./jamaica";
import { NEC_GENERIC } from "./necGeneric";
import type { CodeProfile } from "./types";

export type { CodeProfile } from "./types";
export { NEC_GENERIC } from "./necGeneric";
export { JAMAICA } from "./jamaica";

/** Profiles shipped with the app. IEC-generic needs IEC 60364-5-52 tables (TODO.md). */
export const CODE_PROFILES: readonly CodeProfile[] = [NEC_GENERIC, JAMAICA];
export const DEFAULT_CODE_PROFILE = NEC_GENERIC;

export function getCodeProfile(id: string): CodeProfile | undefined {
  return CODE_PROFILES.find((p) => p.id === id);
}
