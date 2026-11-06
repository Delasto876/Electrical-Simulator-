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
