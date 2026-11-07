# PLAN — Solar Workbench (brief v2)

A professional, CAD-style 3D workbench in the browser for solar PV and
electrical installation design: an empty **Work Surface** (concrete slab, zinc,
Decromastic…), a parts library with real pictures, hardware that snaps
together like real hardware, devices that open up for wiring, and a physics
engine that checks every circuit like an inspector. Not a house designer.

> **Design aid only.** The final design must be verified against local code,
> the utility's rules and the manufacturers' datasheets. Catalog data is
> `verified: false` unless a human checked it.

## 0. Relationship to v1 (the "Classic designer")

Phases 0–8 of the first brief are built and tested (roof-based designer: arrays,
wiring, protection, raceways, simulation, reports, wizard). Brief v2 changes the
product, so:

- **Kept and reused as they are:** `packages/engine` (units, sun position, PV
  single-diode, conductors, MNA, protection, grounding, raceway, simulation),
  `packages/catalog` (parts, schemas), the report writers and weather code.
- **Kept reachable, not extended:** the v1 app, at `#/classic`, until each of
  its features is rebuilt in the Workbench (see the mapping below). It has its
  own CSS and is a separate lazy-loaded chunk.
- **New default app:** the Workbench (`apps/web/src/workbench/`), built to
  brief v2, phase by phase.

| v2 phase | What                                                      | Reuses from v1                             |
| -------- | --------------------------------------------------------- | ------------------------------------------ |
| 0        | Foundation, docs                                          | monorepo, CI, Zod catalog                  |
| 1        | Workbench shell, Work Surface                             | roof surfaces idea, procedural 3D know-how |
| 2        | Parts Library, placement, joints, precision, custom parts | catalog, port model                        |
| 3        | Rails, cut, splice, clamps, modules                       | `engine/mounting` (layout, rail cut)       |
| 4        | Realism pass                                              | —                                          |
| 5        | Engine core wired to Properties                           | `engine` (done; coverage 98 %)             |
| 6        | Openable devices and wiring                               | `model/electricalModel`, ports, nets       |
| 7        | Trunking and conduit                                      | `engine/raceway`, `model/racewayModel`     |
| 8        | Protection, ATS, grounding, TEST                          | `engine/protection`, `grounding`, `ats`    |
| 9        | Simulation and outputs                                    | `engine/sim`, `weather/`, `reports/`       |
| 10       | Polish and ship                                           | PWA, wizard, axe, deploy configs           |

## 1. Architecture

```
┌──────────────────────────── apps/web ───────────────────────────────────────────┐
│  main.tsx ── #/classic → classic/ (v1, lazy)                                     │
│           └─ default  → workbench/                                               │
│                                                                                  │
│  workbench/                                                                      │
│   state/   wbDoc (schema, migrations) · wbStore (event-sourced history)          │
│            wbView (UI state) · commandRegistry (ribbon = search = marking menu)  │
│   ui/      AppBar · Ribbon · BrowserTree · LibraryPanel · PropertiesPanel ·      │
│            Timeline/BottomPanel · StatusBar · ViewCube · NavBar · OptionsBar ·   │
│            MarkingMenu · CommandSearch · ShortcutsSheet · Dock                   │
│   scene/   WorkbenchCanvas · SurfaceBody · textures · materials · environments   │
└───────────────┬───────────────────────────────────────┬──────────────────────────┘
                │ pure calls (no DOM)                    │ JSON + Zod
        ┌───────▼────────┐                        ┌──────▼────────┐
        │ packages/engine│                        │packages/catalog│
        │ physics, rules │                        │ parts + schemas│
        │ surface/ (new) │                        └───────────────┘
        └────────────────┘
```

### Event-sourced history

State is a pure function of `initial + commands[0..cursor]`. Every user action
is a `Command {type, payload, label}` with a reducer. Undo/redo move the
cursor; clicking a card in the **Timeline** rolls back to it; a new command
after a rollback **truncates** the redo tail (logged in DECISIONS). Commands
that are many small edits of one thing (a slider) merge into one card.

### Surfaces and hidden structure

`packages/engine/src/surface/` owns everything about a Work Surface that is
not drawing: the eight types, size/pitch limits, the profile functions (zinc
corrugation, Decromastic tile, standing seam, tile), the hidden **structure**
(purlins, battens, rafters, anchor grids) and the data-driven **attachment rule
set** per type. The web app only turns those numbers into meshes and textures.

### Rendering

Procedural PBR (canvas-generated colour, normal and roughness maps, real
geometry for corrugation, tiles and seams), offline lighting (procedural
environment, no HDR download), shadows from a sun light, display modes
(Realistic, Shaded with edges, Wireframe, X-ray, Exploded), section plane.

## 2. Folder layout

```
packages/engine/src/surface/      surface types, profiles, structure, attachment rules
packages/catalog/                 parts + Zod schemas (unchanged)
apps/web/src/workbench/           the Workbench (new default app)
apps/web/src/classic/             entry for the v1 designer (code still in app/, model/, panels/…)
apps/web/e2e/                     Playwright (workbench.spec.ts + v1 specs under #/classic)
docs/                             CHANGE_GUIDE.md, DEPLOY.md, screenshots/
```

## 3. Phases (brief v2, with a review stop after each)

0. Foundation — monorepo, tooling, CI, Zod catalog, docs. **Done (v1 + this plan).**
1. Workbench shell and canvas — all panels, ribbon, view cube, command search,
   marking menu, docking, themes, Work Surface with all types.
2. Parts Library and placement — thumbnails, drag and drop, joints, L-foot,
   legs, precision system, custom part wizard (breaker, enclosure, ATS).
3. Rails, splice, clamps, modules — cut, splice, clamp, array, offcuts, BOM stub.
4. Realism pass — materials, HDRI, SSAO, SMAA, presets, Render button.
5. Engine core in Properties — Voc, Vmp, Isc, Imp, temperature and irradiance.
6. Openable devices and wiring — Device View, terminals, wire popover, status.
7. Trunking and conduit.
8. Protection, ATS, grounding, TEST workspace (meter, faults).
9. Simulation and outputs (SLD, PDFs, BOM, quotation, checklist).
10. Polish and ship — examples, tour, PWA, accessibility, performance, deploy.

## 4. Risks and mitigations

| Risk                                                            | Mitigation                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope is very large (a full CAD product)                        | Strict phases; each ends with a usable slice, tests, screenshots and a review stop; anything not computable shows "not available" and goes to `TODO.md` |
| Attachment rules and profile dimensions are recalled, not cited | Data-driven, `verified: false`, shown in the UI, listed in `VERIFY.md`                                                                                  |
| 60 fps with 120 panels, 600 hardware pieces, 500 wires          | `InstancedMesh`, frustum culling, render on demand, quality presets (Phase 4); perf test in CI                                                          |
| Headless CI has no GPU                                          | Software WebGL (swiftshader) for Playwright; unit tests for all geometry/maths so the 3D layer stays thin                                               |
| Procedural textures look flat                                   | Height-field based normal maps + roughness variation; real geometry for corrugation and tiles; screenshot review each phase                             |
| v1 and v2 diverge                                               | v1 is frozen at `#/classic`; engine and catalog are shared; features move over phase by phase                                                           |
| Custom part photos (Phase 2) need image tools                   | Canvas-based crop/perspective/background removal written as tested pure functions                                                                       |

## Phase 2 status (done)

Parts Library thumbnails, drag-and-drop placement with ghost and snapping, attachment rules, joints (DIN slots), tilt legs and live BOM, precision system (live dimensions, Tab-to-type with expressions, rulers, guides, snaps, Measure) and the custom part wizard with `.partpack` and the drop-in folder. What is deliberately not done is in `TODO.md` ("after Phase 2"). Decisions D-104 to D-114.

## Phase 3 status (done)

Rails (three profiles, stock lengths) seated on feet, Cut with kerf and an offcut pool, Splice with alignment check and Auto-align into rail runs, modules and arrays snapped onto two rails inside the clamping zones, Clamp Add / Join / Clamp all, Pattern for feet, live mechanical Issues and a stock/waste BOM. Done criterion met by `apps/web/e2e/wb-phase3.spec.ts` (2 × 4 array end to end, cut, splice, one-click clamps, rollback). Decisions D-115 to D-122; not done in `TODO.md` ("after Phase 3").

## Phase 4 status (done, re-scoped: Fusion 360-style workspace)

BUILD tab with Fusion-style groups, Fusion shortcuts and navigation, multi-select, Copy/Paste, Move/Copy with drag arrows, Rectangular Pattern by drag (spacing or extent, two directions), Mirror, Delete of a selection; Origin with X/Y/Z axes and XY/XZ/YZ planes; Surface on plane (roofs, slabs, ground, block and wood walls); devices hang on walls. Decisions D-123 to D-131.

## Phase 5 status (done: catalog, DIN boxes, ready-made boxes, covers)

Real brand inverters (Deye, Growatt, Luxpower, SRNE, Sol-Ark) with datasheet links and a brand filter; HT-series DIN boxes from 4 to 18 way; new DIN devices (2P DC breakers 20 A and 125 A, voltage protector, manual changeover, DIN ATS); **ready-made boxes** (PV combiner 2-in 2-out with breakers and SPDs, battery disconnect, changeover, ATS, AC distribution board, hybrid inverter board) placed as one step; boxes open (door swings, inner cover off) to reach and select the devices; detailed DIN device looks; Look at selection (Shift+F) zooms onto a part. The canvas can no longer be hidden by the panels (layout bar, drawers on small screens). Decisions D-132 to D-137; not done in `TODO.md` ("after Phase 5").

## Phase 6 status (done, re-scoped with the user: professional CAD look and ease of use)

The user asked for a professional CAD look before wiring: Inter font, colour-gradient tool icons per toolbar group, a CAD studio backdrop (default), Fusion-style black dimensions with arrowheads, press-and-drag of parts on the canvas (one Move card, ghosts and live dimensions), a Fusion-like view cube (drag to spin, corner and edge hot spots, 90° turn arrows, home), a 12 × 8 m build plate for new projects (surfaces up to 60 m), rails sold in 14 / 16 / 18 / 20 / 24 ft sticks and the popular 450–720 W modules picked by wattage. Decisions D-138 to D-145. Wiring and raceways move to Phase 7 (below).

## Phase 7 status (done: wiring and raceways)

Wire tool (W): click a terminal on any part (inverters, batteries, DIN devices inside boxes, modules, custom parts), then the terminal it goes to, or pick both by name; colours by polarity; AC-to-DC, reversed polarity and wrong cable kinds are caught. Trunking and conduit runs are drawn by clicking corners (kept square) on walls and roofs; wires are pulled through a run; fill against NEC wireway / conduit limits, a mitre cut list and stock lengths in the BOM; deleting a part takes its wires, deleting a run re-routes its wires directly. Document schema 5. Decisions D-146 to D-152. Electrical simulation in the Workbench is next (Phase 8).

## Phase 8 status (done, re-scoped with the user: measuring and lining up)

Wire colours are picked by the user (13 swatches and any colour; no colour code; schema 6), part sizes in Properties and as dimension lines on the selected part, a unit picker beside them (mm, cm, m, in, ft, ft-in), rows of L-feet placed at a typed distance (count, spacing, direction), the spacing to the previous foot and the whole row editable, and rail alignment (start from the edge, start/end against every parallel rail, Line up). Decisions D-153 to D-158.

## Roadmap after Phase 4 (re-ordered with the user)

5. ✅ (see Phase 5 status; the user's product photos, N/PE bars and wiring inside follow) **Openable boxes and what goes inside**: DIN enclosures, combiner boxes, ATS and manual transfer switches, battery disconnect boxes, distribution panels with removable covers; place breakers, SPDs, AC and DC isolators, voltage regulators, fuses, N/PE bars inside; the user's own product photos as 3D parts.
6. ✅ became the CAD look phase (see Phase 6 status); **wiring and raceways are now Phase 7**: wires between terminals, 4-inch (and other) trunking and conduit run along walls and roofs, wires pulled through them; fill, bends, cut list.
7. ✅ Wiring and raceways (see Phase 7 status).
8. ✅ Measuring and lining up (see Phase 8 status).
9. **Electrical simulation and TEST**: circuits solved in the Workbench (the v1 engine), protection, grounding, ATS behaviour, meter probes, energy simulation.
10. **Realism pass**: post-processing, HDRI, quality presets, renders.
11. **Outputs**: layout drawing, SLD, calculation sheet, BOM, reports (porting v1).
12. **Polish and the installable app**: a desktop build (Tauri or Electron) of the same app, offline, file associations for `.solarbench.json`.

Phases left after Phase 8: four (9–12). The user's photos of real parts can be modelled in any of them.
