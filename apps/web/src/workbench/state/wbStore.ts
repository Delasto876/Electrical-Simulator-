import { create } from "zustand";
import { applyCommand, commandLabel, mergeCommands, reduceAll, type WbCommand } from "./wbCommands";
import { newDoc, type WbDoc } from "./wbDoc";

/**
 * EVENT-SOURCED HISTORY. `docs[i]` is the document after the first `i`
 * commands (`docs[0]` = the initial document); `cursor` is how many are
 * applied. Undo, redo and "roll back to card N" only move the cursor. A new
 * command after a rollback TRUNCATES the undone tail (history is linear; see
 * DECISIONS D-094) and logs it. Edits of the same field within MERGE_MS merge
 * into one card.
 */
export interface HistoryEntry {
  cmd: WbCommand;
  label: string;
  at: number;
}

export interface LogLine {
  at: number;
  level: "info" | "warn";
  text: string;
}

export const MERGE_MS = 800;

/** What is saved and exported. */
export interface WbSnapshot {
  initial: WbDoc;
  commands: WbCommand[];
  cursor: number;
}

interface WbState {
  initial: WbDoc;
  entries: HistoryEntry[];
  docs: WbDoc[];
  cursor: number;
  /** Bumped on every change (autosave and "out of date" checks key on it). */
  revision: number;
  log: LogLine[];
  /** Apply a command. Returns false when it changed nothing (or was refused). */
  dispatch: (cmd: WbCommand, opts?: { merge?: boolean; now?: number }) => boolean;
  undo: () => void;
  redo: () => void;
  rollbackTo: (cursor: number) => void;
  /** Replace everything (new project, open file). */
  reset: (snapshot: WbSnapshot | WbDoc) => void;
  note: (text: string, level?: LogLine["level"]) => void;
  snapshot: () => WbSnapshot;
}

const isSnapshot = (s: WbSnapshot | WbDoc): s is WbSnapshot => "initial" in s;

function build(initial: WbDoc, commands: readonly WbCommand[], cursor: number, at = Date.now()) {
  const docs: WbDoc[] = [initial];
  const entries: HistoryEntry[] = [];
  for (const cmd of commands) {
    const before = docs[docs.length - 1]!;
    docs.push(applyCommand(before, cmd));
    entries.push({ cmd, label: commandLabel(cmd, before), at });
  }
  return { docs, entries, cursor: Math.max(0, Math.min(cursor, commands.length)) };
}

export const useWb = create<WbState>((set, get) => ({
  initial: newDoc(),
  entries: [],
  docs: [newDoc()],
  cursor: 0,
  revision: 0,
  log: [],
  dispatch: (cmd, opts = {}) => {
    const s = get();
    const now = opts.now ?? Date.now();
    const base = s.docs[s.cursor]!;
    const last = s.entries[s.cursor - 1];
    const atEnd = s.cursor === s.entries.length;
    // merge into the previous card
    if (opts.merge && atEnd && last && now - last.at < MERGE_MS) {
      const merged = mergeCommands(last.cmd, cmd);
      if (merged) {
        const prevDoc = s.docs[s.cursor - 1]!;
        const next = applyCommand(prevDoc, merged);
        const entries = [...s.entries];
        const docs = [...s.docs];
        entries[s.cursor - 1] = { cmd: merged, label: commandLabel(merged, prevDoc), at: now };
        docs[s.cursor] = next;
        set({ entries, docs, revision: s.revision + 1 });
        return true;
      }
    }
    const next = applyCommand(base, cmd);
    if (next === base) return false;
    const dropped = s.entries.length - s.cursor;
    const log = [...s.log];
    if (dropped > 0)
      log.push({
        at: now,
        level: "info",
        text: `History is linear: ${dropped} undone command${dropped > 1 ? "s were" : " was"} discarded.`,
      });
    set({
      entries: [...s.entries.slice(0, s.cursor), { cmd, label: commandLabel(cmd, base), at: now }],
      docs: [...s.docs.slice(0, s.cursor + 1), next],
      cursor: s.cursor + 1,
      revision: s.revision + 1,
      log,
    });
    return true;
  },
  undo: () => {
    const s = get();
    if (s.cursor > 0) set({ cursor: s.cursor - 1, revision: s.revision + 1 });
  },
  redo: () => {
    const s = get();
    if (s.cursor < s.entries.length) set({ cursor: s.cursor + 1, revision: s.revision + 1 });
  },
  rollbackTo: (cursor) => {
    const s = get();
    const c = Math.max(0, Math.min(cursor, s.entries.length));
    if (c !== s.cursor) set({ cursor: c, revision: s.revision + 1 });
  },
  reset: (snap) => {
    const initial = isSnapshot(snap) ? snap.initial : snap;
    const commands = isSnapshot(snap) ? snap.commands : [];
    const b = build(initial, commands, isSnapshot(snap) ? snap.cursor : 0);
    set({ initial, ...b, revision: get().revision + 1, log: [] });
  },
  note: (text, level = "info") =>
    set((s) => ({ log: [...s.log, { at: Date.now(), level, text }] })),
  snapshot: () => {
    const s = get();
    return { initial: s.initial, commands: s.entries.map((e) => e.cmd), cursor: s.cursor };
  },
}));

/** The current document. */
export const useDoc = (): WbDoc => useWb((s) => s.docs[s.cursor]!);

/** Current document outside React. */
export const currentDoc = (): WbDoc => {
  const s = useWb.getState();
  return s.docs[s.cursor]!;
};

export { reduceAll };
