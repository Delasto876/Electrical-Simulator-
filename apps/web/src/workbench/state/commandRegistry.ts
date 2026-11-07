import {
  Activity,
  AlignHorizontalJustifyCenter,
  Anvil,
  Battery,
  BrickWall,
  Cable,
  Camera,
  CloudSun,
  Combine,
  ClipboardPaste,
  Copy,
  Cpu,
  Crosshair,
  Eye,
  EyeOff,
  FileText,
  Focus,
  FlipHorizontal,
  Gauge,
  Grid3x3,
  Group,
  Hammer,
  Hand,
  House,
  Keyboard,
  Layers,
  LayoutGrid,
  Link2,
  ListChecks,
  Lock,
  Magnet,
  Maximize,
  Moon,
  Mountain,
  Move,
  Orbit,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pencil,
  Plug,
  PlugZap,
  Printer,
  Rotate3d,
  RotateCw,
  Rows3,
  Ruler,
  Scaling,
  Scissors,
  Search,
  Slice,
  SlidersHorizontal,
  Square,
  SquareDashedMousePointer,
  Sun,
  Sunset,
  Table,
  Tag,
  Trash2,
  Unlock,
  Waves,
  Wrench,
  Zap,
  ZoomIn,
  Box,
  Boxes,
  Package,
  Info,
  Clapperboard,
  TriangleAlert,
  Palette,
  Droplets,
  Image,
  Lightbulb,
  Layout,
  Ungroup,
  Equal,
  Spline,
  Settings,
  CloudRain,
  type LucideIcon,
} from "lucide-react";
import {
  EDGE_STYLES,
  SURFACE_INFO,
  SURFACE_TYPES,
  TILE_COLORS,
  surfaceFacts,
  symmetricFoldDeg,
  type EdgeStyle,
  type SurfaceSpec,
  type SurfaceType,
  type TileColor,
} from "@solar-sim/engine";
import { catalog } from "../../app/catalog";
import { UNITS, UNIT_LABEL, type Unit } from "../lib/units";
import { rotatePlacing, startPlacing } from "./placeActions";
import {
  copySelection,
  deleteSelection,
  hasClipboard,
  paste,
  selectedPartIds,
  startMirror,
  startMove,
  startPattern,
} from "./editActions";
import {
  clampAll,
  startClamp,
  startCut,
  startModule,
  startRail,
  startSplice,
} from "./railToolActions";
import { usePlace } from "./placeState";
import { coverSelection, isCoverOpen, selectedEnclosures } from "./coverActions";
import { kitCardId, kitList } from "../model/kits";
import { SURFACE_ID, SURFACE_NODE_ID } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import {
  DISPLAY_MODE_LABEL,
  DISPLAY_MODES,
  ENV_LABEL,
  ENVIRONMENTS,
  LAYOUT_PRESETS,
  showToast,
  useView,
  type DisplayMode,
  type EnvPreset,
  type ViewKind,
  type Workspace,
} from "./wbView";

/**
 * COMMAND REGISTRY — one definition per command, used by the ribbon, the
 * command search (S), the marking menu and the shortcut handler. To add a
 * command: add it here, then place it in RIBBON below. A command that cannot run
 * yet says why through `disabled` (never a silent dead button).
 */
export interface Cmd {
  id: string;
  label: string | (() => string);
  icon: LucideIcon;
  /** Icon that depends on the current state (the dropdown shows the current choice). */
  iconFn?: () => LucideIcon;
  description: string;
  /** e.g. "F", "Shift+Z". Shown in tooltips and the cheat sheet. */
  shortcut?: string;
  keywords?: string;
  /** A dropdown: the ids of the commands it lists. */
  variants?: string[];
  pressed?: () => boolean;
  /** Reason it cannot run now, or null. */
  disabled?: () => string | null;
  run?: () => void;
}

export const COMMANDS: Record<string, Cmd> = {};
const add = (c: Cmd): Cmd => (COMMANDS[c.id] = c);

export const labelOf = (c: Cmd): string => (typeof c.label === "function" ? c.label() : c.label);
export const iconOf = (c: Cmd): LucideIcon => (c.iconFn ? c.iconFn() : c.icon);

const PHASE_TITLE: Record<number, string> = {
  2: "Parts Library and placement",
  3: "Rails, splice, clamps, modules",
  4: "Realism pass",
  5: "Engine core in Properties",
  6: "Openable devices and wiring",
  7: "Trunking and conduit",
  8: "Protection, ATS, grounding, TEST",
  9: "Simulation and outputs",
  10: "Polish",
};
const later = (phase: number) => () => `Arrives in Phase ${phase} (${PHASE_TITLE[phase]}).`;

/** A command that is planned but not built yet: visible, explained, disabled. */
function future(
  id: string,
  label: string,
  icon: LucideIcon,
  phase: number,
  description: string,
  keywords = "",
): void {
  add({ id, label, icon, description, keywords, disabled: later(phase) });
}

// ---------------------------------------------------------------- document helpers
export { activeSurfaceId } from "./activeSurface";
import { activeSurfaceId } from "./activeSurface";
const activeNodeId = () =>
  Object.values(currentDoc().nodes).find((n) => n.surfaceId === activeSurfaceId())?.id ??
  SURFACE_NODE_ID;
const surface = () => currentDoc().surfaces[activeSurfaceId()]!;
const surfaceLocked = () => !!currentDoc().nodes[activeNodeId()]?.locked;
const lockedReason = () =>
  surfaceLocked() ? "The surface is locked. Unlock it in the Browser tree." : null;

export function setSurface(patch: Partial<SurfaceSpec>, merge = false): boolean {
  const ok = useWb
    .getState()
    .dispatch({ type: "surface.update", id: activeSurfaceId(), patch }, { merge });
  if (!ok && surfaceLocked())
    showToast("The surface is locked. Unlock it in the Browser tree.", "warn");
  return ok;
}

const selection = () => useView.getState().selection;
/** The placed part of the selected Browser node, if it is one. */
const partOfSelection = () => {
  const n = currentDoc().nodes[selection() ?? ""];
  return n?.partId ? currentDoc().parts[n.partId] : undefined;
};
const needSelection = () =>
  selection() ? null : "Select an item in the Browser tree or on the canvas first.";

function openPanel(which: "left" | "right" | "bottom") {
  const v = useView.getState();
  v.set({ layout: { ...v.layout, [`${which}Open`]: true } });
}

/** Open the Properties panel and focus a field in it. */
const focusProp = (id: string) => () => {
  openPanel("right");
  useView.getState().set({ selection: selection() ?? SURFACE_NODE_ID });
  useView.getState().requestFocus(id);
};

// ---------------------------------------------------------------- surface commands
const TYPE_ICON: Record<SurfaceType, LucideIcon> = {
  plain: Square,
  concrete: BrickWall,
  zinc: Waves,
  decromastic: House,
  "standing-seam": Rows3,
  tile: LayoutGrid,
  "membrane-ballast": PanelTop,
  ground: Mountain,
  "block-wall": BrickWall,
  "wood-wall": PanelTop,
};

add({
  id: "surface.type",
  label: () => SURFACE_INFO[surface().type].label,
  icon: Square,
  iconFn: () => TYPE_ICON[surface().type],
  description: "Choose what the Work Surface is: concrete slab, zinc roof, Decromastic, tile…",
  keywords: "surface type roof slab concrete zinc",
  variants: SURFACE_TYPES.map((t) => `surface.type.${t}`),
});
for (const t of SURFACE_TYPES)
  add({
    id: `surface.type.${t}`,
    label: SURFACE_INFO[t].label,
    icon: TYPE_ICON[t],
    description: SURFACE_INFO[t].description,
    keywords: `surface ${t} roof`,
    pressed: () => surface().type === t,
    disabled: lockedReason,
    run: () => {
      useWb.getState().dispatch({ type: "surface.setType", id: activeSurfaceId(), surfaceType: t });
    },
  });

add({
  id: "surface.size",
  label: "Size…",
  icon: Scaling,
  description: "Edit the width and depth of the Work Surface (1–30 m).",
  keywords: "width depth dimensions",
  run: focusProp("prop-width"),
});
add({
  id: "surface.azimuth",
  label: "Azimuth…",
  icon: Rotate3d,
  description: "Edit the compass direction the surface faces (180° = south).",
  keywords: "orientation direction",
  run: focusProp("prop-azimuth"),
});
add({
  id: "surface.rotate",
  label: "Rotate 15°",
  icon: RotateCw,
  description: "Turn the surface 15° clockwise (changes the azimuth).",
  shortcut: "R",
  keywords: "azimuth turn spin",
  disabled: lockedReason,
  run: () => {
    setSurface({ azimuthDeg: (surface().azimuthDeg + 15) % 360 }, true);
  },
});
const PITCHES = [0, 5, 10, 15, 20, 25, 30, 45];
add({
  id: "surface.pitch",
  label: () => `Pitch ${surface().pitchDeg}°`,
  icon: Slice,
  description: "Tilt the surface 0–45° above horizontal.",
  keywords: "tilt slope angle",
  variants: [...PITCHES.map((p) => `surface.pitch.${p}`), "surface.pitch.custom"],
});
for (const p of PITCHES)
  add({
    id: `surface.pitch.${p}`,
    label: `${p}°`,
    icon: Slice,
    description: `Set the pitch to ${p}°.`,
    pressed: () => surface().pitchDeg === p,
    disabled: lockedReason,
    run: () => {
      setSurface({ pitchDeg: p });
    },
  });
add({
  id: "surface.pitch.custom",
  label: "Other angle…",
  icon: Pencil,
  description: "Type any pitch from 0 to 45°.",
  run: focusProp("prop-pitch"),
});

add({
  id: "surface.structure",
  label: "Show structure",
  icon: Layers,
  description:
    "Show the hidden structure (purlins, battens, rafters, anchor grid) the hardware attaches to.",
  shortcut: "K",
  keywords: "purlin batten rafter anchor hidden",
  pressed: () => surface().showStructure,
  disabled: lockedReason,
  run: () => {
    setSurface({ showStructure: !surface().showStructure });
  },
});
add({
  id: "surface.edge",
  label: () => `Edge: ${surface().edge}`,
  icon: Combine,
  description: "Edge style: square, chamfered, or a raised parapet.",
  keywords: "parapet chamfer border",
  variants: EDGE_STYLES.map((e) => `surface.edge.${e}`),
});
for (const e of EDGE_STYLES)
  add({
    id: `surface.edge.${e}`,
    label: e[0]!.toUpperCase() + e.slice(1),
    icon: Combine,
    description: `${e} edge.`,
    pressed: () => surface().edge === (e as EdgeStyle),
    disabled: lockedReason,
    run: () => {
      setSurface({ edge: e });
    },
  });
add({
  id: "surface.second",
  label: "Second plane",
  icon: Boxes,
  description: "Add a second plane hinged at the up-slope edge (a gable or a fold).",
  keywords: "gable ridge fold",
  pressed: () => surface().secondPlane.enabled,
  disabled: lockedReason,
  run: () => {
    const s = surface();
    setSurface({
      secondPlane: {
        enabled: !s.secondPlane.enabled,
        foldDeg: s.secondPlane.enabled ? s.secondPlane.foldDeg : symmetricFoldDeg(s.pitchDeg || 15),
      },
    });
  },
});
add({
  id: "surface.tile",
  label: () => `Colour: ${surface().tileColor}`,
  icon: Palette,
  description: "Colour of the stone coating or tile.",
  keywords: "colour color tile stone",
  variants: TILE_COLORS.map((c) => `surface.tile.${c}`),
  disabled: () =>
    ["decromastic", "tile"].includes(surface().type)
      ? lockedReason()
      : "Only Decromastic and tile surfaces have a colour.",
});
for (const c of TILE_COLORS)
  add({
    id: `surface.tile.${c}`,
    label: c[0]!.toUpperCase() + c.slice(1),
    icon: Palette,
    description: `${c} tile colour.`,
    pressed: () => surface().tileColor === (c as TileColor),
    disabled: () =>
      ["decromastic", "tile"].includes(surface().type)
        ? lockedReason()
        : "Only Decromastic and tile surfaces have a colour.",
    run: () => {
      setSurface({ tileColor: c });
    },
  });
add({
  id: "surface.facts",
  label: "Surface data",
  icon: Info,
  description: "Area, projected area and rise of the surface.",
  run: () => {
    const f = surfaceFacts(surface());
    showToast(
      `Surface ${f.areaM2.toFixed(1)} m², seen from above ${f.projectedAreaM2.toFixed(1)} m², rise ${f.riseM.toFixed(2)} m`,
    );
  },
});

// ---------------------------------------------------------------- planned mounting commands
const LFOOTS: [string, string][] = [
  ["lfoot", "L-foot"],
  ["slotted", "Slotted L-foot"],
  ["tilehook", "Tile hook"],
  ["standoff", "Standoff"],
  ["seamclamp", "Seam clamp"],
  ["baseplate", "Base plate with anchors"],
  ["ballast", "Ballast block"],
  ["groundscrew", "Ground screw"],
];
add({
  id: "mount.lfoot",
  label: "L-foot",
  icon: Anvil,
  description: "Place feet that attach the rails to the surface.",
  keywords: "foot hook standoff attachment",
  variants: LFOOTS.map(([k]) => `mount.${k}`),
});
const KIND_OF: Record<string, string> = {
  lfoot: "l-foot",
  slotted: "slotted-l-foot",
  tilehook: "tile-hook",
  standoff: "corrugated-standoff",
  seamclamp: "seam-clamp",
  baseplate: "base-plate",
  ballast: "ballast-block",
  groundscrew: "ground-screw",
};
/** The first catalog part of a mounting kind (the library lets you choose another). */
function hardwareFor(match: (p: (typeof catalog)[number]) => boolean): string | undefined {
  return catalog.find(match)?.id;
}
const placeBlocked = () => lockedReason();
for (const [k, l] of LFOOTS)
  add({
    id: `mount.${k}`,
    label: l,
    icon: Anvil,
    description: `Place a ${l.toLowerCase()} on a valid attachment point of the surface.`,
    keywords: "foot hook attachment",
    disabled: () => {
      if (placeBlocked()) return placeBlocked();
      return hardwareFor((p) => p.category === "roof-attachment" && p.mounting.kind === KIND_OF[k])
        ? null
        : "No such part in the catalog.";
    },
    run: () => {
      const id = hardwareFor(
        (p) => p.category === "roof-attachment" && p.mounting.kind === KIND_OF[k],
      );
      if (id) startPlacing(id);
    },
  });
for (const [role, label] of [
  ["front", "Front leg"],
  ["back", "Back leg"],
] as const)
  add({
    id: `mount.leg${role}`,
    label,
    icon: Hammer,
    description: `Tilt leg at the ${role === "front" ? "low" : "high"} edge; its length follows the tilt angle.`,
    keywords: "tilt leg",
    disabled: placeBlocked,
    run: () => {
      const id = hardwareFor((p) => p.category === "tilt-leg" && p.mounting.role === role);
      if (id) startPlacing(id);
    },
  });
const needParts = () =>
  selectedPartIds().length
    ? lockedReason()
    : "Select parts first (Shift or Ctrl+click to add more).";
add({
  id: "mount.pattern",
  label: "Rectangular pattern",
  icon: Grid3x3,
  description:
    "Copies of the selection in rows and columns at a set spacing: drag the arrow and copies appear every spacing (feet, legs, modules, devices).",
  keywords: "pattern array rows columns copy repeat spacing",
  disabled: needParts,
  run: () => void startPattern(),
});
add({
  id: "mount.rail",
  label: "Rail",
  icon: Ruler,
  description: "Place a rail onto the feet.",
  variants: ["mount.rail.light", "mount.rail.std", "mount.rail.heavy"],
});
const railTool = (id: string, label: string, catalogId: string, description: string) =>
  add({
    id,
    label,
    icon: Ruler,
    description,
    keywords: "rail place stock",
    disabled: lockedReason,
    run: () => void startRail(catalogId),
  });
railTool(
  "mount.rail.light",
  "Light rail",
  "generic-rail-light",
  "Light-duty rail profile (stock 2.1, 3.6, 4.2 m).",
);
railTool(
  "mount.rail.std",
  "Standard rail",
  "generic-rail-standard",
  "Standard rail profile (stock 2.1, 3.6, 4.2 m).",
);
railTool(
  "mount.rail.heavy",
  "Heavy-duty rail",
  "generic-rail-heavy",
  "Heavy-duty rail profile (stock 2.1, 3.6, 4.2 m).",
);
const noRails = () =>
  lockedReason() ??
  (Object.values(currentDoc().parts).some((p) => p.rail) ? null : "Place a rail first.");
add({
  id: "mount.cut",
  label: "Cut",
  icon: Scissors,
  description:
    "Cut a rail at a typed distance, a foot, a clamp or the midpoint, with kerf; the cut-off goes to the offcut pool.",
  shortcut: "Shift+C",
  keywords: "cut rail kerf offcut",
  disabled: noRails,
  run: () => startCut(),
});
add({
  id: "mount.splice",
  label: "Splice",
  icon: Link2,
  description: "Join two rails with a splice; checks they are in line and offers Auto-align.",
  keywords: "join rail splice",
  disabled: () =>
    lockedReason() ??
    (Object.values(currentDoc().parts).filter((p) => p.rail).length >= 2
      ? null
      : "Place two rails first."),
  run: () => startSplice(),
});
add({
  id: "mount.clamp",
  label: "Clamp",
  icon: Wrench,
  description: "Mid and end clamps that hold the modules (Add one, or Join modules).",
  variants: ["mount.clamp.mid", "mount.clamp.end", "mount.clamp.all"],
});
const noModules = () =>
  lockedReason() ??
  (Object.values(currentDoc().parts).some((p) => p.module)
    ? null
    : "Place modules on the rails first.");
add({
  id: "mount.clamp.mid",
  label: "Mid clamp",
  icon: Wrench,
  description: "Mid clamps between two modules (20 mm gap). Join: click two neighbouring modules.",
  keywords: "clamp join",
  disabled: noModules,
  run: () => startClamp("mid", "join"),
});
add({
  id: "mount.clamp.end",
  label: "End clamp",
  icon: Wrench,
  description: "End clamps at the edge of an array. Add mode: hover a rail and click.",
  keywords: "clamp add",
  disabled: noModules,
  run: () => startClamp("end", "add"),
});
add({
  id: "mount.clamp.all",
  label: "Clamp all",
  icon: Wrench,
  description:
    "One click: end clamps at every outer edge and mid clamps between modules, on every rail.",
  shortcut: "J",
  keywords: "join clamps all",
  disabled: noModules,
  run: () => void clampAll(),
});
const DEFAULT_MODULE = "generic-pv-550w-144hc";
add({
  id: "mod.place",
  label: "Module",
  icon: Package,
  description: "Place a PV module onto two rails, portrait or landscape (R).",
  keywords: "pv panel",
  disabled: () =>
    lockedReason() ??
    (Object.values(currentDoc().parts).some((p) => p.rail) ? null : "Place rails first."),
  run: () => void startModule(DEFAULT_MODULE),
});
add({
  id: "mod.array",
  label: "Array",
  icon: Table,
  description:
    "Rows × columns of modules with the mid-clamp gap (set rows and columns in the options bar).",
  keywords: "pv panel rows columns",
  disabled: () =>
    lockedReason() ??
    (Object.values(currentDoc().parts).some((p) => p.rail) ? null : "Place rails first."),
  run: () => void startModule(DEFAULT_MODULE, 2, 4),
});
future(
  "mod.weeb",
  "Bonding lug",
  Zap,
  8,
  "WEEB and rail grounding lugs for the bonding path.",
  "weeb ground",
);
future("mod.jumper", "Jumper", Spline, 8, "Bonding jumper between rails.", "bond");

// ---------------------------------------------------------------- modify / organise
add({
  id: "mod.move",
  label: "Move/Copy",
  icon: Move,
  description: "Move or copy the selection: drag the arrows or type the distances (Fusion: M).",
  shortcut: "M",
  keywords: "move copy translate drag",
  disabled: needParts,
  run: () => void startMove(),
});
add({
  id: "mod.rotate",
  label: "Rotate",
  icon: Rotate3d,
  description: "Rotate the selected part by 15°. While placing, the R key rotates the ghost.",
  keywords: "turn angle",
  disabled: () =>
    usePlace.getState().placing || partOfSelection() ? null : "Select a placed part first.",
  run: () => {
    if (usePlace.getState().placing) return rotatePlacing(15);
    const p = partOfSelection();
    if (p)
      useWb
        .getState()
        .dispatch(
          { type: "part.rotate", id: p.id, rotDeg: (p.rotDeg + 15) % 360 },
          { merge: true },
        );
  },
});
future(
  "mod.align",
  "Align",
  AlignHorizontalJustifyCenter,
  10,
  "Align parts to an edge, centre or guide.",
);
add({
  id: "mod.mirror",
  label: "Mirror",
  icon: FlipHorizontal,
  description:
    "Symmetry: mirror the selection across the surface centre line, a guide or a typed line.",
  keywords: "mirror symmetry flip",
  disabled: needParts,
  run: () => void startMirror(),
});
add({
  id: "edit.copy",
  label: "Copy",
  icon: Copy,
  description: "Copy the selection (Ctrl+V pastes it beside the originals).",
  shortcut: "Ctrl+C",
  keywords: "copy duplicate clipboard",
  disabled: () => (selectedPartIds().length ? null : "Select parts first."),
  run: () => void copySelection(),
});
add({
  id: "edit.paste",
  label: "Paste",
  icon: ClipboardPaste,
  description: "Paste the copied parts next to the originals, ready to move (M).",
  shortcut: "Ctrl+V",
  keywords: "paste duplicate clipboard",
  disabled: () => lockedReason() ?? (hasClipboard() ? null : "Copy parts first (Ctrl+C)."),
  run: () => void paste(),
});
future("edit.group", "Group", Group, 10, "Group parts so they move together.");
future("edit.ungroup", "Ungroup", Ungroup, 10, "Break a group apart.");
add({
  id: "edit.selectall",
  label: "Select all",
  icon: SquareDashedMousePointer,
  description: "Select every placed part.",
  shortcut: "Ctrl+A",
  keywords: "select all",
  run: () => {
    const nodes = Object.values(currentDoc().nodes)
      .filter((n) => n.partId)
      .map((n) => n.id);
    useView
      .getState()
      .set({ selection: nodes[0] ?? null, multi: nodes.slice(1), libraryPart: null });
  },
});
add({
  id: "edit.delete",
  label: "Delete",
  icon: Trash2,
  description: "Delete the selected parts. (The Work Surface itself cannot be deleted.)",
  shortcut: "Delete",
  keywords: "remove",
  disabled: () => {
    if (!selectedPartIds().length) return "Select a placed part first.";
    return currentDoc().nodes[selection()!]?.locked ? "The part is locked." : null;
  },
  run: () => void deleteSelection(),
});
add({
  id: "edit.hide",
  label: () => (currentDoc().nodes[selection() ?? ""]?.visible === false ? "Show" : "Hide"),
  icon: EyeOff,
  iconFn: () => (currentDoc().nodes[selection() ?? ""]?.visible === false ? Eye : EyeOff),
  description: "Hide or show the selected item.",
  shortcut: "V",
  keywords: "visibility eye",
  disabled: needSelection,
  run: () => {
    const id = selection()!;
    const n = currentDoc().nodes[id];
    if (n) useWb.getState().dispatch({ type: "node.visible", id, visible: !n.visible });
  },
});
add({
  id: "edit.lock",
  label: () => (currentDoc().nodes[selection() ?? ""]?.locked ? "Unlock" : "Lock"),
  icon: Lock,
  iconFn: () => (currentDoc().nodes[selection() ?? ""]?.locked ? Unlock : Lock),
  description: "Lock the selected item so it cannot be edited by accident.",
  shortcut: "L",
  keywords: "freeze",
  disabled: needSelection,
  run: () => {
    const id = selection()!;
    const n = currentDoc().nodes[id];
    if (n) useWb.getState().dispatch({ type: "node.locked", id, locked: !n.locked });
  },
});
add({
  id: "edit.isolate",
  label: () => (useView.getState().isolated ? "End isolate" : "Isolate"),
  icon: Crosshair,
  description: "Show only the selected item (press again to show everything).",
  shortcut: "Shift+I",
  keywords: "focus alone",
  disabled: () => (useView.getState().isolated ? null : needSelection()),
  run: () => {
    const v = useView.getState();
    v.set({ isolated: v.isolated ? null : v.selection });
  },
});
add({
  id: "edit.rename",
  label: "Rename",
  icon: Pencil,
  description: "Rename the selected item in the Browser tree.",
  shortcut: "F2",
  disabled: needSelection,
  run: () => {
    openPanel("left");
    useView.getState().set({ renamingId: selection() });
  },
});
add({
  id: "edit.tag",
  label: "Colour tag",
  icon: Tag,
  description: "Tag the selected item with a colour (click the dot in the Browser tree).",
  disabled: needSelection,
  run: () => {
    const id = selection()!;
    const order = [null, "red", "orange", "yellow", "green", "blue", "purple", "grey"] as const;
    const cur = currentDoc().nodes[id]?.color ?? null;
    useWb.getState().dispatch({
      type: "node.color",
      id,
      color: order[(order.indexOf(cur) + 1) % order.length] ?? null,
    });
  },
});

// ---------------------------------------------------------------- inspect
add({
  id: "inspect.measure",
  label: "Measure",
  icon: Ruler,
  description: "Click two points on the surface to measure the distance. Esc ends the tool.",
  shortcut: "I",
  keywords: "distance tape",
  pressed: () => useView.getState().measuring,
  disabled: () => (usePlace.getState().placing ? "Finish or cancel placing first." : null),
  run: () => {
    const on = !useView.getState().measuring;
    useView.getState().set({ measuring: on });
    usePlace.getState().set({ measureA: null, measureHover: null });
    if (on) showToast("Measure: click the first point, then the second. Esc ends.");
  },
});
add({
  id: "inspect.measure.clear",
  label: "Clear measurements",
  icon: Trash2,
  description: "Remove every measurement from the surface.",
  disabled: () => (currentDoc().measurements.length ? null : "No measurements."),
  run: () => void useWb.getState().dispatch({ type: "measure.clear" }),
});
add({
  id: "lib.addpart",
  label: "Add custom part",
  icon: Box,
  description:
    "Make a library part from a product photo: DIN breaker, DIN enclosure or transfer switch.",
  keywords: "upload photo wizard user part pack",
  run: () => {
    openPanel("left");
    useView.getState().set({ wizardOpen: true });
  },
});
add({
  id: "construct.surface",
  label: "Surface on plane",
  icon: Layers,
  description:
    "Build a new face on a plane: roof, slab or ground on XZ; a block or wood wall on XY or YZ.",
  keywords: "construct plane wall roof face offset",
  run: () => useView.getState().set({ construct: { plane: "xz" } }),
});
add({
  id: "construct.wall",
  label: "Wall",
  icon: BrickWall,
  description: "A wall to mount inverters, batteries, boxes and trunking on (block or wood).",
  keywords: "construct wall block wood",
  run: () => useView.getState().set({ construct: { plane: "xy" } }),
});
add({
  id: "construct.origin",
  label: () => (useView.getState().origin.axes ? "Hide origin" : "Show origin"),
  icon: Crosshair,
  description: "Show the origin axes (X red, Y green, Z blue) like Fusion 360's Origin folder.",
  keywords: "origin axes planes",
  pressed: () => useView.getState().origin.axes,
  run: () => {
    const o = useView.getState().origin;
    useView.getState().set({ origin: { ...o, axes: !o.axes } });
  },
});
add({
  id: "construct.surface.delete",
  label: "Delete surface",
  icon: Trash2,
  description: "Delete the selected surface (not the first one) and everything on it.",
  keywords: "remove wall roof",
  disabled: () => {
    const n = currentDoc().nodes[selection() ?? ""];
    if (!n?.surfaceId) return "Select a surface in the Browser first.";
    return n.surfaceId === SURFACE_ID ? "The first surface cannot be deleted." : null;
  },
  run: () => {
    const n = currentDoc().nodes[selection() ?? ""];
    if (n?.surfaceId && useWb.getState().dispatch({ type: "surface.delete", id: n.surfaceId }))
      useView.getState().set({ selection: null });
  },
});
add({
  id: "view.rulers",
  label: "Rulers",
  icon: Ruler,
  description:
    "Show rulers along the surface edges. Drag from a ruler onto the surface to pull out a guide line.",
  shortcut: "Shift+R",
  keywords: "guides scale",
  pressed: () => useView.getState().rulers,
  run: () => useView.getState().set({ rulers: !useView.getState().rulers }),
});
future(
  "inspect.dimension",
  "Dimension",
  Equal,
  10,
  "Place a persistent, editable dimension on the canvas.",
);
future(
  "inspect.origin",
  "Set origin",
  Crosshair,
  10,
  "Move the coordinate origin of the Work Surface.",
);
add({
  id: "inspect.section",
  label: "Section plane",
  icon: Slice,
  description: "Cut the model with a plane to look inside (options bar: axis, offset, flip).",
  shortcut: "X",
  keywords: "cut clip",
  pressed: () => useView.getState().section.enabled,
  run: () => {
    const v = useView.getState();
    v.set({
      activeCommand: { id: "inspect.section", backup: v.section },
      section: { ...v.section, enabled: true },
    });
  },
});
add({
  id: "inspect.section.clear",
  label: "Clear section",
  icon: Slice,
  description: "Remove the section plane.",
  disabled: () => (useView.getState().section.enabled ? null : "There is no section plane."),
  run: () => {
    const v = useView.getState();
    v.set({ section: { ...v.section, enabled: false }, activeCommand: null });
  },
});
add({
  id: "inspect.issues",
  label: "Issues",
  icon: TriangleAlert,
  description: "Open the Issues tab.",
  run: () => {
    openPanel("bottom");
    useView.getState().set({ bottomTab: "issues" });
  },
});
add({
  id: "inspect.properties",
  label: "Properties",
  icon: SlidersHorizontal,
  description: "Show the Properties panel for the selection.",
  run: () => {
    openPanel("right");
    if (!selection()) useView.getState().set({ selection: SURFACE_NODE_ID });
  },
});

// ---------------------------------------------------------------- view
const VIEWS: [ViewKind, string, string | undefined][] = [
  ["fit", "Fit", "F"],
  ["top", "Top", "T"],
  ["front", "Front", "1"],
  ["right", "Right", "3"],
  ["back", "Back", undefined],
  ["left", "Left", undefined],
  ["iso", "Isometric", "0"],
  ["normal", "Face surface", "N"],
];
for (const [k, l, sc] of VIEWS)
  add({
    id: `view.${k}`,
    label: l,
    icon: k === "fit" ? Maximize : k === "normal" ? Focus : Box,
    description:
      k === "fit"
        ? "Fit the whole Work Surface in the window."
        : k === "normal"
          ? "Look straight at the surface (normal to its plane)."
          : `${l} view.`,
    shortcut: sc,
    keywords: `view camera ${k}`,
    run: () => useView.getState().requestView(k),
  });
add({
  id: "view.frame",
  label: "Look at selection",
  icon: Focus,
  description: "Zoom the camera onto the selected parts (a device inside a box frames its box).",
  shortcut: "Shift+F",
  disabled: needSelection,
  run: () => {
    const doc = currentDoc();
    const ids = selectedPartIds().map((id) => doc.parts[id]?.mount?.enclosureId ?? id);
    useView.getState().requestView("fit", ids.length ? [...new Set(ids)] : undefined);
  },
});

add({
  id: "view.display",
  label: () => DISPLAY_MODE_LABEL[useView.getState().displayMode],
  icon: Box,
  description: "Display mode: Realistic, Shaded with edges, Wireframe, X-ray, Exploded.",
  keywords: "shaded wireframe xray exploded realistic",
  variants: DISPLAY_MODES.map((m) => `view.display.${m}`),
});
for (const m of DISPLAY_MODES)
  add({
    id: `view.display.${m}`,
    label: DISPLAY_MODE_LABEL[m],
    icon: Box,
    description: `${DISPLAY_MODE_LABEL[m]} display.`,
    pressed: () => useView.getState().displayMode === m,
    run: () => useView.getState().set({ displayMode: m as DisplayMode }),
  });
const ENV_ICON: Record<EnvPreset, LucideIcon> = {
  studio: Lightbulb,
  daylight: Sun,
  overcast: CloudRain,
  sunset: Sunset,
};
add({
  id: "view.env",
  label: () => ENV_LABEL[useView.getState().env],
  icon: Sun,
  iconFn: () => ENV_ICON[useView.getState().env],
  description: "Lighting environment: studio, daylight, overcast, sunset.",
  keywords: "lighting hdri sky",
  variants: ENVIRONMENTS.map((e) => `view.env.${e}`),
});
for (const e of ENVIRONMENTS)
  add({
    id: `view.env.${e}`,
    label: ENV_LABEL[e],
    icon: ENV_ICON[e],
    description: `${ENV_LABEL[e]} lighting.`,
    pressed: () => useView.getState().env === e,
    run: () => useView.getState().set({ env: e as EnvPreset }),
  });
add({
  id: "view.grid",
  label: "Ground grid",
  icon: Grid3x3,
  description: "Show or hide the ground grid.",
  shortcut: "G",
  pressed: () => useView.getState().grid,
  run: () => useView.getState().set({ grid: !useView.getState().grid }),
});
const togglePanel = (key: "left" | "right" | "bottom") => () => {
  const v = useView.getState();
  v.set({ layout: { ...v.layout, [`${key}Open`]: !v.layout[`${key}Open`] } });
};
add({
  id: "view.browser",
  label: "Browser",
  icon: PanelLeft,
  description: "Show or hide the Browser and Parts Library panel.",
  shortcut: "B",
  pressed: () => useView.getState().layout.leftOpen,
  run: togglePanel("left"),
});
add({
  id: "view.properties",
  label: "Properties",
  icon: PanelRight,
  description: "Show or hide the Properties panel.",
  shortcut: "P",
  pressed: () => useView.getState().layout.rightOpen,
  run: togglePanel("right"),
});
add({
  id: "view.timeline",
  label: "Timeline",
  icon: PanelBottom,
  description: "Show or hide the Timeline and result tabs.",
  shortcut: "Shift+B",
  pressed: () => useView.getState().layout.bottomOpen,
  run: togglePanel("bottom"),
});
add({
  id: "view.layout",
  label: "Layout",
  icon: Layout,
  description: "Panel layout presets.",
  variants: Object.keys(LAYOUT_PRESETS).map((k) => `view.layout.${k}`),
});
for (const [name, layout] of Object.entries(LAYOUT_PRESETS))
  add({
    id: `view.layout.${name}`,
    label: name,
    icon: Layout,
    description: `Panel layout: ${name}.`,
    run: () => useView.getState().set({ layout: { ...layout } }),
  });
add({
  id: "view.theme",
  label: () => (useView.getState().theme === "dark" ? "Light theme" : "Dark theme"),
  icon: Moon,
  iconFn: () => (useView.getState().theme === "dark" ? Sun : Moon),
  description: "Switch between the dark and the light theme.",
  shortcut: "Shift+T",
  run: () =>
    useView.getState().set({ theme: useView.getState().theme === "dark" ? "light" : "dark" }),
});
add({
  id: "view.units",
  label: () => `Units: ${UNIT_LABEL[useView.getState().units]}`,
  icon: Ruler,
  description: "Length units: mm, cm, m, in, ft-in.",
  variants: UNITS.map((u) => `view.units.${u}`),
});
for (const u of UNITS)
  add({
    id: `view.units.${u}`,
    label: UNIT_LABEL[u],
    icon: Ruler,
    description: `Show lengths in ${UNIT_LABEL[u]}.`,
    pressed: () => useView.getState().units === u,
    run: () => useView.getState().set({ units: u as Unit }),
  });
add({
  id: "view.orbit",
  label: "Orbit",
  icon: Orbit,
  description:
    "Left mouse button orbits the view (press again for Fusion 360 navigation: middle pans, Shift+middle orbits).",
  pressed: () => useView.getState().navMode === "orbit",
  run: () =>
    useView
      .getState()
      .set({ navMode: useView.getState().navMode === "orbit" ? "select" : "orbit" }),
});
add({
  id: "view.pan",
  label: "Pan",
  icon: Hand,
  description:
    "Left mouse button pans the view (press again for Fusion 360 navigation: middle pans, Shift+middle orbits).",
  pressed: () => useView.getState().navMode === "pan",
  run: () =>
    useView.getState().set({ navMode: useView.getState().navMode === "pan" ? "select" : "pan" }),
});
add({
  id: "view.zoom",
  label: "Zoom",
  icon: ZoomIn,
  description:
    "Left mouse button zooms the view (press again for Fusion 360 navigation: middle pans, Shift+middle orbits).",
  pressed: () => useView.getState().navMode === "zoom",
  run: () =>
    useView.getState().set({ navMode: useView.getState().navMode === "zoom" ? "select" : "zoom" }),
});

// ---------------------------------------------------------------- app
add({
  id: "app.search",
  label: "Find command",
  icon: Search,
  description: "Search every command by name and run it.",
  shortcut: "S",
  run: () => useView.getState().set({ searchOpen: true }),
});
add({
  id: "app.shortcuts",
  label: "Keyboard shortcuts",
  icon: Keyboard,
  description: "Show the shortcut cheat sheet.",
  shortcut: "?",
  run: () => useView.getState().set({ shortcutsOpen: true }),
});
add({
  id: "app.about",
  label: "About and disclaimer",
  icon: Info,
  description: "About this app, and why every design must be verified.",
  run: () => useView.getState().set({ aboutOpen: true }),
});
add({
  id: "edit.undo",
  label: "Undo",
  icon: Activity,
  description: "Undo the last command.",
  shortcut: "Ctrl+Z",
  disabled: () => (useWb.getState().cursor > 0 ? null : "Nothing to undo."),
  run: () => useWb.getState().undo(),
});
add({
  id: "edit.redo",
  label: "Redo",
  icon: Activity,
  description: "Redo the command you undid.",
  shortcut: "Ctrl+Shift+Z",
  disabled: () =>
    useWb.getState().cursor < useWb.getState().entries.length ? null : "Nothing to redo.",
  run: () => useWb.getState().redo(),
});

// ---------------------------------------------------------------- later workspaces (planned)
for (const [k, l, ic] of [
  ["pv", "PV wire", Cable],
  ["thhn", "THHN/THWN-2", Cable],
  ["battery", "Battery cable", Battery],
  ["ground", "Bare ground", Zap],
] as [string, string, LucideIcon][])
  future(
    `wire.${k}`,
    l,
    ic,
    6,
    `Pick ${l}, a gauge and an end termination, then choose the destination terminal.`,
  );
add({
  id: "wire.add",
  label: "Add wire",
  icon: Cable,
  description: "Draw a wire from one terminal to another.",
  variants: ["wire.pv", "wire.thhn", "wire.battery", "wire.ground"],
});
future(
  "wire.connect",
  "Connect",
  Plug,
  6,
  "Connect two terminals with a wire and see if the circuit is closed, open or shorted.",
);
future("wire.trace", "Trace net", Crosshair, 6, "Light up everything connected to a terminal.");
const noEnclosure = () =>
  selectedEnclosures().length ? null : "Select a DIN box or a device inside one.";
add({
  id: "dev.open",
  label: "Open cover",
  icon: Boxes,
  description:
    "Swing the door open and lift the inner cover off the selected DIN box, to reach the devices inside. Double-click a box does the same.",
  keywords: "open cover door enclosure box remove lid din inside",
  disabled: noEnclosure,
  run: () => void coverSelection(true),
});
add({
  id: "dev.close",
  label: "Close cover",
  icon: Box,
  description: "Put the inner cover back and close the door of the selected DIN box.",
  keywords: "close cover door enclosure box lid",
  disabled: () =>
    noEnclosure() ??
    (selectedEnclosures().some(isCoverOpen) ? null : "The cover is already closed."),
  run: () => void coverSelection(false),
});
add({
  id: "insert.kit",
  label: "Ready-made box",
  icon: Package,
  description:
    "Insert a DIN box with its devices already fitted: PV combiner 2-in 2-out, battery disconnect, ATS, changeover, distribution boards.",
  keywords: "kit combiner 2 in 2 out spd breaker ats changeover distribution board box",
  run: () => {
    openPanel("left");
    useView.getState().set({ libraryQuery: "", libraryBrand: null });
    requestAnimationFrame(() =>
      document.querySelector('[data-testid="library-kits"]')?.scrollIntoView({ block: "start" }),
    );
    showToast("Drag a ready-made box onto a wall or surface, or double-click it.");
  },
});
for (const k of kitList())
  add({
    id: `kit.${k.id}`,
    label: k.name,
    icon: Package,
    description: k.description,
    keywords: `kit box ${k.tags.join(" ")}`,
    disabled: lockedReason,
    run: () => void startPlacing(kitCardId(k)),
  });
future(
  "race.trunk",
  "Trunking",
  Rows3,
  7,
  "Draw trunking; add cables; fill gauge and mitre cut list.",
);
future(
  "race.conduit",
  "Conduit",
  Spline,
  7,
  "Draw conduit with elbows, bend counter and expansion fittings.",
);
future("prot.breaker", "Breaker", PlugZap, 8, "Snap DIN breakers onto a rail.");
future("prot.fuse", "Fuse", Zap, 8, "Battery fuses (Class T, MRBF, ANL).");
future("prot.ats", "Transfer switch", Cpu, 8, "Place an ATS and choose its source priority.");
future("prot.ground", "Ground rod", Mountain, 8, "Ground rods and the bonding graph.");
future(
  "test.meter",
  "Multimeter",
  Gauge,
  8,
  "Virtual meter with probes: volts, continuity, resistance.",
);
future("test.clamp", "Clamp meter", Gauge, 8, "Measure current in a wire.");
future("test.toggle", "Switches", PlugZap, 8, "Toggle breakers, isolators and the ATS source.");
future(
  "test.fault",
  "Inject fault",
  TriangleAlert,
  8,
  "Open a wire, loosen a lug, reverse polarity, short two terminals.",
);
future(
  "test.scenario",
  "Troubleshoot",
  Wrench,
  8,
  "Find a hidden fault with the meter (5 scenarios).",
);
future("sim.sun", "Sun & time", Sun, 9, "Scrub the sun and shadows with the time slider.");
future("sim.weather", "Weather", CloudSun, 9, "Choose a place and real hourly weather.");
future(
  "sim.run",
  "Run energy",
  Activity,
  9,
  "Time-series energy simulation with battery, grid and generator.",
);
future("sim.losses", "Loss waterfall", Droplets, 9, "Where the energy goes.");
future("out.sld", "Single-line diagram", FileText, 9, "Generated from the wiring.");
future("out.calc", "Calculation sheet", Table, 9, "Every number the checks rest on (PDF).");
future("out.bom", "Bill of materials", ListChecks, 9, "Quantities, CSV, Excel and PDF.");
future(
  "out.layout",
  "Mounting layout",
  Printer,
  3,
  "Top-view drawing with dimensions for the crew.",
);
future("out.checklist", "Checklist", ListChecks, 9, "Installation and commissioning checklist.");
future("out.render", "Render", Camera, 4, "Path-traced still image.");
future("out.turntable", "Turntable", Clapperboard, 4, "Turntable video of the model.");
future(
  "out.image",
  "Surface photo",
  Image,
  2,
  "Use a photo of a real roof as the surface material.",
);
future("out.logo", "Brand", Settings, 9, "Company logo and colours for reports.");
future("out.magnet", "Snap options", Magnet, 2, "Grid, point, edge and angle snaps.");

// ---------------------------------------------------------------- ribbon layout
export interface RibbonItem {
  id: string;
}
export interface RibbonPanel {
  label: string;
  items: RibbonItem[];
  /** Fusion-style group: the title is a ▾ menu listing the buttons and these extra commands. */
  more?: string[];
}
export interface RibbonTab {
  id: string;
  label: string;
  panels: RibbonPanel[];
}
const P = (label: string, ...ids: string[]): RibbonPanel => ({
  label,
  items: ids.map((id) => ({ id })),
});

/** A Fusion 360-style group: a few big buttons, the title opens the whole list. */
const G = (label: string, buttons: string[], more: string[] = []): RibbonPanel => ({
  label,
  items: buttons.map((id) => ({ id })),
  more,
});

/** The main tab, laid out like Fusion 360's SOLID tab. */
const BUILD_TAB: RibbonTab = {
  id: "build",
  label: "BUILD",
  panels: [
    G(
      "CREATE",
      ["mount.lfoot", "mount.rail", "mod.array", "mount.pattern", "mod.mirror"],
      ["mount.legfront", "mount.legback", "mod.place", "lib.addpart"],
    ),
    G(
      "MODIFY",
      ["mod.move", "mount.cut", "mount.splice", "edit.delete"],
      ["mod.rotate", "edit.copy", "edit.paste", "mod.align"],
    ),
    G("ASSEMBLE", ["mount.clamp.all", "mount.clamp"], ["edit.group", "edit.ungroup"]),
    G(
      "CONSTRUCT",
      ["construct.surface", "construct.wall", "construct.origin"],
      ["view.rulers", "construct.surface.delete"],
    ),
    G(
      "INSPECT",
      ["inspect.measure", "inspect.section"],
      ["inspect.measure.clear", "inspect.issues", "surface.facts"],
    ),
    G(
      "INSERT",
      ["insert.kit", "lib.addpart"],
      ["dev.open", "dev.close", ...kitList().map((k) => `kit.${k.id}`)],
    ),
    G("SELECT", ["edit.selectall"], ["edit.hide", "edit.lock", "edit.isolate"]),
  ],
};

const VIEW_TAB: RibbonTab = {
  id: "view",
  label: "VIEW",
  panels: [
    P(
      "Views",
      "view.fit",
      "view.top",
      "view.front",
      "view.right",
      "view.iso",
      "view.normal",
      "view.frame",
    ),
    P("Display", "view.display", "view.env", "view.grid", "view.rulers"),
    P("Panels", "view.browser", "view.properties", "view.timeline", "view.layout"),
    P("Appearance", "view.theme", "view.units"),
  ],
};

export const RIBBON: Record<Workspace, RibbonTab[]> = {
  design: [
    BUILD_TAB,
    {
      id: "surface",
      label: "SURFACE",
      panels: [
        P("Type", "surface.type"),
        P(
          "Size and direction",
          "surface.size",
          "surface.pitch",
          "surface.azimuth",
          "surface.rotate",
        ),
        P("Structure", "surface.structure"),
        P("Shape", "surface.edge", "surface.second"),
        P("Material", "surface.tile", "out.image"),
      ],
    },
    {
      id: "mount",
      label: "MOUNT",
      panels: [
        P("Feet and legs", "mount.lfoot", "mount.legfront", "mount.legback", "mount.pattern"),
        P("Rails", "mount.rail", "mount.cut", "mount.splice"),
        P("Clamps", "mount.clamp", "mount.clamp.all"),
      ],
    },
    {
      id: "modules",
      label: "MODULES",
      panels: [P("Modules", "mod.place", "mod.array"), P("Bonding", "mod.weeb", "mod.jumper")],
    },
    {
      id: "modify",
      label: "MODIFY",
      panels: [
        P("Transform", "mod.move", "mod.rotate", "mod.align", "mod.mirror"),
        P("Organise", "edit.hide", "edit.lock", "edit.isolate", "edit.rename", "edit.tag"),
        P("Edit", "edit.copy", "edit.group", "edit.ungroup", "edit.delete"),
      ],
    },
    {
      id: "inspect",
      label: "INSPECT",
      panels: [
        P(
          "Measure",
          "inspect.measure",
          "inspect.measure.clear",
          "inspect.dimension",
          "inspect.origin",
          "out.magnet",
        ),
        P("Section", "inspect.section", "inspect.section.clear"),
        P("Review", "inspect.issues", "inspect.properties", "surface.facts"),
      ],
    },
    VIEW_TAB,
  ],
  wiring: [
    {
      id: "wire",
      label: "WIRE",
      panels: [
        P("Wires", "wire.add", "wire.connect", "wire.trace"),
        P("Devices", "dev.open", "dev.close"),
      ],
    },
    {
      id: "protect",
      label: "PROTECT",
      panels: [P("Protection", "prot.breaker", "prot.fuse", "prot.ats", "prot.ground")],
    },
    { id: "raceway", label: "RACEWAY", panels: [P("Raceway", "race.trunk", "race.conduit")] },
    VIEW_TAB,
  ],
  test: [
    {
      id: "instruments",
      label: "INSTRUMENTS",
      panels: [
        P("Meters", "test.meter", "test.clamp"),
        P("Switches and faults", "test.toggle", "test.fault", "test.scenario"),
      ],
    },
    VIEW_TAB,
  ],
  simulate: [
    { id: "sun", label: "SUN", panels: [P("Sun and weather", "sim.sun", "sim.weather")] },
    { id: "energy", label: "ENERGY", panels: [P("Energy", "sim.run", "sim.losses")] },
    VIEW_TAB,
  ],
  output: [
    {
      id: "documents",
      label: "DOCUMENTS",
      panels: [
        P("Drawings", "out.layout", "out.sld"),
        P("Reports", "out.calc", "out.bom", "out.checklist", "out.logo"),
        P("Images", "out.render", "out.turntable"),
      ],
    },
    VIEW_TAB,
  ],
};

/** Commands the search lists (everything runnable on its own). */
export function searchableCommands(): Cmd[] {
  return Object.values(COMMANDS).filter((c) => c.run || c.disabled);
}

/** Why a command cannot run now, or null. */
export const disabledReason = (c: Cmd): string | null => (c.disabled ? c.disabled() : null);

/** Run a command if it is enabled; otherwise tell the user why. */
export function runCommand(id: string): boolean {
  const c = COMMANDS[id];
  if (!c) return false;
  const why = disabledReason(c);
  if (why) {
    showToast(why, "warn");
    return false;
  }
  c.run?.();
  return true;
}

export { TYPE_ICON };
