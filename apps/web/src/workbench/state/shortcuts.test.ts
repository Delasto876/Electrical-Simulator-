import { describe, expect, it } from "vitest";
import { eventToCombo } from "./shortcuts";
import { COMMANDS, RIBBON, disabledReason, labelOf, searchableCommands } from "./commandRegistry";

const k = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => eventToCombo({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("shortcut combos", () => {
  it("letters are upper-case; modifiers are named; shift on a symbol is not part of the combo", () => {
    expect(k("f")).toBe("F");
    expect(k("F", { shiftKey: true })).toBe("Shift+F");
    expect(k("z", { ctrlKey: true })).toBe("Ctrl+Z");
    expect(k("z", { metaKey: true, shiftKey: true })).toBe("Ctrl+Shift+Z");
    expect(k("?", { shiftKey: true })).toBe("?");
    expect(k("Enter")).toBe("Enter");
    expect(k("F2")).toBe("F2");
    expect(k(" ")).toBe("Space");
    expect(k("0")).toBe("0");
  });
});

describe("command registry", () => {
  it("every ribbon item and dropdown variant exists", () => {
    const missing: string[] = [];
    for (const tabs of Object.values(RIBBON))
      for (const t of tabs)
        for (const p of t.panels)
          for (const it of p.items) {
            const c = COMMANDS[it.id];
            if (!c) missing.push(it.id);
            else for (const v of c.variants ?? []) if (!COMMANDS[v]) missing.push(v);
          }
    expect(missing).toEqual([]);
  });

  it("shortcuts are unique", () => {
    const seen = new Map<string, string>();
    for (const c of Object.values(COMMANDS))
      if (c.shortcut) {
        expect(
          seen.get(c.shortcut),
          `${c.shortcut} used by ${seen.get(c.shortcut)} and ${c.id}`,
        ).toBeUndefined();
        seen.set(c.shortcut, c.id);
      }
  });

  it("every disabled planned command says which phase it arrives in", () => {
    for (const c of Object.values(COMMANDS)) {
      const why = disabledReason(c);
      if (why && /Arrives/.test(why)) expect(why).toMatch(/Arrives in Phase \d+ \(.+\)\./);
    }
    expect(disabledReason(COMMANDS["mount.cut"]!)).toMatch(/rail first/);
    expect(disabledReason(COMMANDS["wire.connect"]!)).toMatch(/Phase 6/);
  });

  it("labels are readable and the search lists runnable and explained commands", () => {
    expect(labelOf(COMMANDS["surface.type.zinc"]!)).toBe("Zinc roof");
    expect(searchableCommands().length).toBeGreaterThan(100);
    expect(searchableCommands().some((c) => c.id === "inspect.section")).toBe(true);
  });
});
