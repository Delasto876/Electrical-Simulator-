import { beforeEach, describe, expect, it } from "vitest";
import { newDoc, SURFACE_ID } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { useView } from "./wbView";
import { usePlace } from "./placeState";
import { cancelPlacing, commitCandidate, startPlacing, updateCandidate } from "./placeActions";
import {
  coverSelection,
  isCoverOpen,
  placingDinDevice,
  selectedEnclosures,
  toggleCover,
} from "./coverActions";
import { COMMANDS, runCommand } from "./commandRegistry";

beforeEach(() => {
  useWb.getState().reset(newDoc());
  usePlace.setState({ placing: null, cand: null, raw: null, typing: null, free: true });
  useView.setState({ selection: null, multi: [], libraryPart: null, toast: null, openCovers: [] });
});

const placeKit = (id: string) => {
  expect(startPlacing(`kit:${id}`)).toBe(true);
  expect(usePlace.getState().placing?.kitId).toBe(id);
  expect(updateCandidate(SURFACE_ID, 0, 0)?.valid).toBe(true);
  expect(commitCandidate(false)).toBe(true);
  const d = currentDoc();
  const enc = Object.values(d.parts).find((p) => !p.mount)!;
  return { d, enc, encNode: Object.values(d.nodes).find((n) => n.partId === enc.id)! };
};

describe("ready-made boxes and covers", () => {
  it("a kit card places the box with its devices as one undoable step", () => {
    const before = useWb.getState().cursor;
    const { d, enc } = placeKit("kit-pv-2in2out");
    expect(Object.values(d.parts).filter((p) => p.mount?.enclosureId === enc.id)).toHaveLength(4);
    expect(useWb.getState().cursor).toBe(before + 1);
    expect(useView.getState().toast?.text).toMatch(/PV combiner 2-in 2-out/);
    useWb.getState().undo();
    expect(Object.keys(currentDoc().parts)).toHaveLength(0);
  });

  it("open and close the cover of the selected box (or of a selected device's box)", () => {
    const { d, enc, encNode } = placeKit("kit-ats");
    expect(useView.getState().selection).toBe(encNode.id); // the placed box is selected
    useView.setState({ selection: null });
    expect(COMMANDS["dev.open"]!.disabled?.()).toMatch(/Select a DIN box/);
    useView.setState({ selection: encNode.id });
    expect(selectedEnclosures()).toEqual([enc.id]);
    expect(COMMANDS["dev.close"]!.disabled?.()).toMatch(/already closed/);
    expect(coverSelection(true)).toBe(true);
    expect(isCoverOpen(enc.id)).toBe(true);
    expect(COMMANDS["dev.close"]!.disabled?.()).toBeNull();
    const dev = Object.values(d.parts).find((p) => p.mount)!;
    const devNode = Object.values(d.nodes).find((n) => n.partId === dev.id)!;
    useView.setState({ selection: devNode.id });
    expect(selectedEnclosures()).toEqual([enc.id]);
    runCommand("dev.close");
    expect(isCoverOpen(enc.id)).toBe(false);
    toggleCover(enc.id);
    expect(isCoverOpen(enc.id)).toBe(true);
    toggleCover(dev.id); // not an enclosure: ignored
    expect(useView.getState().openCovers).toEqual([enc.id]);
  });

  it("covers show open while a DIN device is being placed", () => {
    expect(placingDinDevice()).toBe(false);
    usePlace.setState({ free: false });
    expect(startPlacing("generic-mcb-dc-2p-20a")).toBe(true);
    expect(placingDinDevice()).toBe(true);
    cancelPlacing();
    expect(placingDinDevice()).toBe(false);
  });

  it("each kit has a command in the registry", () => {
    expect(COMMANDS["kit.kit-battery-disconnect"]?.label).toMatch(/Battery disconnect/);
    expect(COMMANDS["insert.kit"]).toBeDefined();
  });
});
