import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from "immer";
import { getCodeProfile, DEFAULT_CODE_PROFILE } from "@solar-sim/engine";
import {
  DEFAULT_UNITS,
  NEW_PROJECT_CODE_PROFILE,
  NEW_PROJECT_NAME,
  NEW_PROJECT_ROOF,
} from "../config/defaults";
import { newProject, type ProjectFile } from "../project/projectFile";

enablePatches();

/**
 * The project document plus undo/redo history. Every change goes through
 * `commit(label, recipe)` (see state/actions.ts), which records Immer patches
 * so undo/redo replays exact inverses. Nothing else should mutate `project`.
 */
interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  /** Consecutive commits with the same mergeKey within MERGE_WINDOW_MS become one undo step (e.g. dragging a slider). */
  mergeKey?: string | undefined;
  at: number;
}

/** Edits to the same field closer together than this merge into one undo step [ms]. */
const MERGE_WINDOW_MS = 1000;

interface ProjectState {
  project: ProjectFile;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Bumped on every change; autosave listens to it. */
  revision: number;
  commit: (label: string, recipe: (draft: Draft<ProjectFile>) => void, mergeKey?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the whole document (load/import/new). Clears history. */
  replace: (p: ProjectFile) => void;
}

/** Keep at most this many undo steps. */
const HISTORY_LIMIT = 200;

export function freshProject(): ProjectFile {
  const profile = getCodeProfile(NEW_PROJECT_CODE_PROFILE) ?? DEFAULT_CODE_PROFILE;
  return newProject({
    name: NEW_PROJECT_NAME,
    codeProfileId: profile.id,
    climate: { ...profile.climateDefaults },
    roof: NEW_PROJECT_ROOF,
    lengthUnits: DEFAULT_UNITS.length,
    wireUnits: DEFAULT_UNITS.wire,
  });
}

export const useProject = create<ProjectState>((set, get) => ({
  project: freshProject(),
  past: [],
  future: [],
  revision: 0,
  commit: (label, recipe, mergeKey) => {
    const [next, patches, inverse] = produceWithPatches(get().project, recipe);
    if (patches.length === 0) return;
    const now = Date.now();
    set((s) => {
      const last = s.past[s.past.length - 1];
      if (mergeKey && last?.mergeKey === mergeKey && now - last.at < MERGE_WINDOW_MS) {
        const merged: HistoryEntry = {
          label,
          mergeKey,
          at: now,
          patches: [...last.patches, ...patches],
          inverse: [...inverse, ...last.inverse],
        };
        return {
          project: next,
          past: [...s.past.slice(0, -1), merged],
          future: [],
          revision: s.revision + 1,
        };
      }
      return {
        project: next,
        past: [...s.past, { label, patches, inverse, mergeKey, at: now }].slice(-HISTORY_LIMIT),
        future: [],
        revision: s.revision + 1,
      };
    });
  },
  undo: () => {
    const { past, project } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    set((s) => ({
      project: applyPatches(project, entry.inverse),
      past: past.slice(0, -1),
      future: [entry, ...s.future],
      revision: s.revision + 1,
    }));
  },
  redo: () => {
    const { future, project } = get();
    const entry = future[0];
    if (!entry) return;
    set((s) => ({
      project: applyPatches(project, entry.patches),
      past: [...s.past, entry],
      future: future.slice(1),
      revision: s.revision + 1,
    }));
  },
  replace: (p) => set((s) => ({ project: p, past: [], future: [], revision: s.revision + 1 })),
}));
