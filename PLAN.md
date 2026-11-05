# PLAN — 3D Solar & Electrical Design Simulator

A browser-based, fully 3D PV and electrical design aid. Not a stamped engineering
tool: every result must be verified against local code, the utility and
manufacturer datasheets.

## 1. Architecture

```
┌──────────────────────────── apps/web (React + R3F) ────────────────────────────┐
│ Toolbar │ Parts palette │   3D viewport (three.js)   │ Inspector │ Bottom tabs  │
│         │               │  procedural parts + .glb   │           │ Issues/Calc/ │
│         │               │                            │           │ Charts/BOM   │
│                     Zustand + Immer store (scene doc, undo/redo patches)        │
│                     Storage interface → IndexedDB autosave / JSON export        │
└───────────────┬───────────────────────────────────────┬────────────────────────┘
                │ pure function calls (no DOM)           │ JSON + Zod
        ┌───────▼────────┐                        ┌──────▼────────┐
        │ packages/engine│  ← CodeProfile data →  │packages/catalog│
        │ physics + DRC  │                        │ parts + schemas│
        └────────────────┘                        └───────┬────────┘
                                                          │ modelUrl
                                          ┌───────────────▼──────────────┐
                                          │ tools/blender (headless bpy) │
                                          │ Python → .glb (committed)    │
                                          └──────────────────────────────┘
```

### Packages

| Path               | Responsibility                                                                                                                                               | Must not import              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `packages/engine`  | Units, constants, sun position, PV single-diode model, conductors, ampacity, MNA solver, raceway, grounding, mechanical, DRC, code profiles, time-series sim | DOM, React, three            |
| `packages/catalog` | Zod schemas for every part category, JSON data (all `verified: false`), loaders, CSV/JSON import/export                                                      | DOM, React, three            |
| `apps/web`         | App shell, 3D scene, tools (cable, conduit, trunking, measure), inspector, reports, persistence                                                              | — (no physics formulas here) |
| `tools/blender`    | Headless Blender (`bpy`) scripts producing `.glb` for fixed-shape parts                                                                                      | —                            |

### 3D model strategy (hybrid — see DECISIONS.md D-003)

- **Procedural in three.js** (reshape live from specs): PV modules, rails, splices,
  tilt legs, roof surfaces, cables/PV wire tubes, conduit runs and bends,
  trunking with mitre cuts, DIN rail, ground conductor.
- **Blender-generated `.glb`** (fixed shapes, high detail): MC4 male/female and
  branch connectors, inverters, charge controllers, batteries, DIN breakers/RCDs/
  SPDs, enclosures, combiner boxes, clamps, L-feet, tile hooks, seam clamps, WEEBs,
  lugs, ground rod clamp, ATS, meter, generator.
- Every part renders through one `<PartModel>` wrapper: if the catalog entry has
  `modelUrl`, load the glb; otherwise use the procedural builder. Glb files are
  modelled in metres, +Y up, origin at the mounting face, and carry named empties
  `port:<id>` that the loader turns into typed ports.
- Generated glb files are committed under `apps/web/public/models/`. Scripts live
  in `tools/blender/parts/*.py`; `pnpm models` regenerates them (needs `bpy`).

### Scene document

`ProjectFile { schemaVersion, meta, site, codeProfileId, parts[], connections[], cables[], raceways[], settings }`
with `migrations[n]: (vN) => vN+1`. The store applies Immer patches; undo/redo keeps
inverse patches.

### Engine data flow

scene → electrical graph (nodes = terminals, edges = conductors/devices/switches)
→ MNA solve (Newton–Raphson for PV) → per-edge V/I/P → checks → `Issue[]`.
Bonding graph is a separate graph traversal. All rule limits come from the
active `CodeProfile`.

## 2. Folder layout

```
.
├─ apps/web/                 Vite + React + R3F app
│  ├─ public/models/         committed .glb exports from Blender
│  ├─ src/{app,scene,panels,state,storage,styles}/
│  └─ e2e/                   Playwright tests
├─ packages/engine/src/      pure TS physics, rules, profiles
├─ packages/catalog/src/     zod schemas, loaders; data/*.json
├─ tools/blender/            bpy scripts, requirements.txt, build_all.py
├─ docs/screenshots/         Playwright screenshots per phase
├─ .github/workflows/ci.yml  lint, typecheck, test, build, e2e
├─ PLAN.md  CLAUDE.md  DECISIONS.md  VERIFY.md  TODO.md  README.md
```

## 3. Phases (from the brief, with review stop after each)

0. Foundation — monorepo, tooling, CI, Zod schemas, app shell, rotating cube
   (exported from headless Blender to prove the glb pipeline).
1. Engine core — units, constants, sun position, single-diode, I–V, AWG,
   voltage drop, ampacity, MNA; demo I–V page.
2. Roof + panels + mounting hardware in 3D; ports, snapping, array tool, undo,
   inspector, BOM stub.
3. Wiring + MC4 + strings + inverter/battery; String Wizard; DC Vd.
4. Protection, DIN enclosure, ATS, grounding/bonding, fault current.
5. Raceway — conduit/trunking tools, fill, bends, mitres, cut list.
6. Simulation — weather, POA, shading, time series, battery/ATS, charts.
7. Reports — SLD, calc PDF, BOM/quotation, checklist.
8. Polish — wizard, examples, PWA, perf, a11y, deploy config.

## 4. Risks and mitigations

| Risk                                                  | Mitigation                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Code tables recalled from memory may be wrong         | `// VERIFY` markers + `VERIFY.md`; tests cite sources; UI badge "unverified"                  |
| Catalog numbers mistaken for manufacturer data        | `verified: false` default, badge in UI, catalog editor for real data                          |
| Single-diode fit fails to converge for odd datasheets | Robust bounded solver, fallback to linear-coefficient quick mode, surfaced as a warning       |
| MNA with nonlinear PV sources diverges                | Damped Newton, source stepping, iteration cap, diode-voltage limiting; property tests for KCL |
| 60 fps with 120 panels + 500 wires                    | `InstancedMesh`, merged geometry for hardware, LOD, on-demand rendering                       |
| Large glb files bloat the repo                        | Low-poly models, Draco/meshopt later if needed, size budget check in `build_all.py`           |
| Blender not available in CI                           | glb files are committed; CI never needs Blender (D-004)                                       |
| Scope is very large                                   | Strict phase gates; anything not computable shows "not available" and goes to `TODO.md`       |
| Hurricane wind estimate misused                       | Prominent "simplified estimate" labelling and hurricane warning                               |
