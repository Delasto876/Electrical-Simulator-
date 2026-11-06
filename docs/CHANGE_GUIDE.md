# Change guide: where do I change X?

Every kind of change has **one** home. Find your change in the table, edit that
file, run the check in the last column. You should not need to touch anything
else.

## Quick map

| I want to change…                                                                                                 | Edit this                                                                                                                                           | Then run              |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Defaults** the app starts with (roof, units, new array size, snap step, camera views, scene colours)            | `apps/web/src/config/defaults.ts`                                                                                                                   | `pnpm dev`            |
| **A part's numbers** (dimensions, electrical specs, price, ports)                                                 | `packages/catalog/src/data/<category>.json`                                                                                                         | `pnpm test`           |
| **Add a part** (new module, rail, clamp…)                                                                         | Add an entry to the matching `packages/catalog/src/data/*.json`                                                                                     | `pnpm test`           |
| **The 3D look of a fixed-shape part** (clamp, L-foot, later: inverter, MC4…)                                      | `tools/blender/parts/<part>.py` (reads sizes from the catalog JSON)                                                                                 | `pnpm models`         |
| **The 3D look of a spec-driven part** (modules, rails, legs)                                                      | `apps/web/src/parts/` (`ModuleInstances.tsx`, `BoxInstances.tsx`) and `parts/registry.ts`                                                           | `pnpm dev`            |
| **Which renderer draws which category**                                                                           | `apps/web/src/parts/registry.ts`                                                                                                                    | `pnpm dev`            |
| **Roof types, roof coverings, their look**                                                                        | `apps/web/src/roofs/registry.ts` (UI) and `packages/engine/src/site/roof.ts` (geometry)                                                             | `pnpm test`           |
| **How arrays are laid out** (rail overhang, clamp-zone position, default spacing, setback, row-shading sun angle) | `packages/engine/src/mounting/rules.ts`                                                                                                             | `pnpm test`           |
| **Layout logic** (where rails/clamps/feet/legs go, leg-length formula, rail cutting)                              | `packages/engine/src/mounting/layout.ts`, `tilt.ts`, `railCut.ts`                                                                                   | `pnpm test`           |
| **Which clamp/attachment is picked automatically**                                                                | `apps/web/src/model/hardware.ts` (logic) and `PREFERRED_ATTACHMENT` in `config/defaults.ts` (preferences)                                           | `pnpm test`           |
| **Design-rule wording** (issue titles, beginner explanations)                                                     | `packages/engine/src/drc/issue.ts` (`ISSUE_CODES`)                                                                                                  | `pnpm test`           |
| **Code tables and limits** (ampacity, derating, voltage-drop limits)                                              | `packages/engine/src/profiles/` and `packages/engine/src/conductors/tables.ts`                                                                      | `pnpm test`           |
| **Physics constants** (with sources)                                                                              | `packages/engine/src/constants.ts`                                                                                                                  | `pnpm test`           |
| **What a user action does** (add/move/delete array, roof edits, undo labels)                                      | `apps/web/src/state/actions.ts`: every edit lives here                                                                                              | `pnpm test`           |
| **Keyboard shortcuts**                                                                                            | `apps/web/src/app/shortcuts.ts` (the `?` overlay reads the same list)                                                                               | `pnpm dev`            |
| **How lengths, weights and angles are displayed**                                                                 | `apps/web/src/lib/format.ts`                                                                                                                        | `pnpm dev`            |
| **Inspector panels**                                                                                              | `apps/web/src/panels/inspector/` (one file per selection type)                                                                                      | `pnpm dev`            |
| **Result tabs** (Issues, BOM, Charts, Calculations)                                                               | `apps/web/src/panels/results/`, `panels/charts/`, `panels/calcs/`                                                                                   | `pnpm dev`            |
| **Saved project format**                                                                                          | `apps/web/src/project/projectFile.ts`: bump `CURRENT_SCHEMA_VERSION` and **add** a migration                                                        | `pnpm test`           |
| **UI colours / theme**                                                                                            | CSS variables at the top of `apps/web/src/styles/app.css`                                                                                           | `pnpm dev`            |
| **Port keys and port world positions** (modules, parts, array PE lug)                                             | `apps/web/src/model/ports.ts`                                                                                                                       |
| **Strings** (auto-string, chunking, string ends)                                                                  | `apps/web/src/model/strings.ts`                                                                                                                     |
| **Default cable for a port type**, cable colours                                                                  | `apps/web/src/config/defaults.ts` (`DEFAULT_CABLE_FOR_PORT`, `CABLE_COLORS`)                                                                        |
| **Which ports may be cabled together** (MC4 ↔ DC terminal, battery lugs…)                                         | `CABLE_PAIRS` in `packages/engine/src/drc/electrical.ts`                                                                                            |
| **DC string/MPPT/battery checks** (Voc, Vmp, polarity, cable sizing, DC disconnect, battery fuse)                 | `apps/web/src/model/electricalModel.ts` (glue) → `packages/engine/src/strings/`, `drc/electrical.ts`, `protection/`                                 |
| **Inverters** (models, MPPTs, ports)                                                                              | `packages/catalog/scripts/gen_inverters.py` (regenerates `data/inverters.json`)                                                                     |
| **Breakers, fuses, combiners, enclosures, ATS, rods, utility, generator, loads** (catalog)                        | `packages/catalog/scripts/gen_protection.py` (regenerates the matching `data/*.json`)                                                               |
| **What a device connects through** (breaker poles, fuse in↔out, ATS slots)                                        | `apps/web/src/model/deviceLinks.ts`                                                                                                                 |
| **Connectivity** (wire nets, reach through devices)                                                               | `apps/web/src/model/nets.ts`                                                                                                                        |
| **Breaker / fuse / combiner rules** (kA, voltage, rating, conductor protection, polarity)                         | `apps/web/src/model/protectionModel.ts` (glue) → `packages/engine/src/protection/ocpd.ts`                                                           |
| **Inverter capacity vs loads, battery current**                                                                   | `packages/engine/src/protection/capacity.ts`                                                                                                        |
| **Code tables for protection** (standard OCPD sizes, EGC table, GEC minimum, rod target)                          | `protection` in `packages/engine/src/profiles/necGeneric.ts` (and other profiles)                                                                   |
| **Grounding & bonding rules** (floating metal, rods, EGC/GEC sizes)                                               | `apps/web/src/model/groundingModel.ts` → `packages/engine/src/grounding/groundRod.ts`                                                               |
| **ATS behaviour** (priority, nested, checks)                                                                      | `packages/engine/src/ats/atsLogic.ts`; wiring detection in `apps/web/src/model/atsModel.ts`                                                         |
| **DIN rail geometry, slot placement, mounted-device pose**                                                        | `apps/web/src/model/placement.ts`                                                                                                                   |
| **What a part can be swapped for**                                                                                | `apps/web/src/model/swap.ts`                                                                                                                        |
| **Example projects** (Examples menu)                                                                              | `apps/web/src/model/examples.ts` (tested in `examples.test.ts`)                                                                                     |
| **Camera framing (F)**                                                                                            | `apps/web/src/app/focus.ts`                                                                                                                         |
| **Conduit / trunking types and sizes** (internal diameter, OD, listings, prices, fittings)                        | `packages/catalog/scripts/gen_raceway.py` (regenerates `conduits.json`, `conduit-fittings.json`, `trunking.json`)                                   |
| **Raceway code limits** (fill %, 360° rule, bend radii, support spacing, PVC expansion)                           | `raceway` in `packages/engine/src/profiles/necGeneric.ts`                                                                                           |
| **Raceway maths** (bends, fillets, mitres, fill, packing, expansion, stock cutting)                               | `packages/engine/src/raceway/`                                                                                                                      |
| **Raceway rules, cable routing through raceways, raceway BOM**                                                    | `apps/web/src/model/racewayModel.ts`                                                                                                                |
| **What a new run starts as** (default conduit/trunking, location, colours)                                        | `RACEWAY` in `apps/web/src/config/defaults.ts`                                                                                                      |
| **How drawing works** (point placement, risers, finish/undo)                                                      | `apps/web/src/app/racewayTool.ts`                                                                                                                   |
| **Raceway 3D look** (tube, fittings, mitred pieces, cut labels)                                                   | `apps/web/src/scene/RacewayObjects.tsx`                                                                                                             |
| **Raceway inspector / Cut list tab**                                                                              | `apps/web/src/panels/inspector/RacewayInspector.tsx`, `apps/web/src/panels/results/CutList.tsx`                                                     |
| **Weather source** (Open-Meteo request, parsing, place search, cache, clear-sky fallback)                         | `apps/web/src/weather/` (`openMeteo.ts`, `cache.ts`, `clearSky.ts`)                                                                                 |
| **Time steps and local time** (period range, interpolation, time zones)                                           | `apps/web/src/weather/steps.ts`, `timezone.ts`                                                                                                      |
| **Irradiance models** (POA, IAM, Erbs, clear sky)                                                                 | `packages/engine/src/irradiance/poa.ts`                                                                                                             |
| **Shading geometry** (ray vs tree/tank/building/module)                                                           | `packages/engine/src/sim/shading.ts`; which occluders exist: `apps/web/src/model/simModel.ts`                                                       |
| **Bypass diodes / string MPP under shade**                                                                        | `packages/engine/src/pv/bypass.ts`                                                                                                                  |
| **Battery, inverter dispatch, generator and ATS rules**                                                           | `packages/engine/src/sim/battery.ts`, `sim/dispatch.ts`                                                                                             |
| **The time-series loop, loss waterfall, daily/monthly totals**                                                    | `packages/engine/src/sim/simulate.ts`                                                                                                               |
| **What the simulation is built from** (modules, strings, inverter, battery, loads, AC wiring)                     | `apps/web/src/model/simModel.ts`                                                                                                                    |
| **Simulation defaults, default site, load profiles, obstruction sizes**                                           | `DEFAULT_SIMULATION`, `DEFAULT_SITE`, `DEFAULT_LOAD_PROFILES`, `OBSTRUCTION_DEFAULTS` in `apps/web/src/config/defaults.ts`                          |
| **Running a simulation** (fetch → steps → worker), results store, chart rows                                      | `apps/web/src/sim/`                                                                                                                                 |
| **Simulation tab, site search, load-use editor, obstruction inspector**                                           | `apps/web/src/panels/sim/`, `panels/inspector/SiteLocation.tsx`, `LoadProfileEditor.tsx`, `ObstructionInspector.tsx`                                |
| **Sun light, obstruction 3D look, live cable currents**                                                           | `apps/web/src/scene/SunLight.tsx`, `ObstructionObjects.tsx`, `apps/web/src/model/liveCurrents.ts`                                                   |
| **The spreadsheet day check**                                                                                     | `tools/check/day_check.py` (writes `docs/verification/day-check/`), test `apps/web/src/model/dayCheck.test.ts`                                      |
| **Company name, logo, contact details, report disclaimer**                                                        | `apps/web/src/config/company.ts` (logo: `apps/web/src/assets/lumix-logo.png`)                                                                       | `pnpm dev`            |
| **Checklist pass/fail limits** (insulation test, Voc tolerance)                                                   | `apps/web/src/config/checklist.ts`                                                                                                                  | `pnpm test`           |
| **What a report contains** (sections, columns, notes)                                                             | `apps/web/src/reports/`: `calcSheet.ts`, `bomReport.ts`, `checklist.ts`, `sldReport.ts`                                                             | `pnpm test`           |
| **Single-line diagram layout and symbols**                                                                        | `apps/web/src/reports/sld.ts` (shapes in `drawing.ts`)                                                                                              | `pnpm test`           |
| **Device tags** (INV1, CB2, F1…) and one-line ratings                                                             | `apps/web/src/reports/designators.ts`                                                                                                               | `pnpm test`           |
| **PDF look** (title block, fonts, tables, page breaks)                                                            | `apps/web/src/reports/pdf.ts`                                                                                                                       | `pnpm test`           |
| **Excel / CSV output**                                                                                            | `apps/web/src/reports/xlsx.ts`, `sheets.ts`, `csv.ts`                                                                                               | `pnpm test`           |
| **Which formats each report offers, file saving**                                                                 | `apps/web/src/reports/exports.ts`                                                                                                                   | `pnpm dev`            |
| **Reports tab / BOM tab**                                                                                         | `apps/web/src/panels/reports/`, `apps/web/src/panels/results/BomTable.tsx`                                                                          | `pnpm dev`            |
| **In-app confirm / notice dialogs** (no browser pop-ups)                                                          | `apps/web/src/app/dialogs.ts`, `DialogHost.tsx`                                                                                                     | `pnpm dev`            |
| **The clickable preview link** (claude.ai page build)                                                             | `tools/publish/build_artifact.py`; models load through `apps/web/src/parts/modelLoader.ts`                                                          | `pnpm build:artifact` |
| **Workbench: a ribbon button, a menu item, a shortcut, a search entry** (one command, all four)                   | `apps/web/src/workbench/state/commandRegistry.ts` (add the command, then list it in `RIBBON`)                                                       | `pnpm dev`            |
| **Workbench: what a user action does to the document** (new command type)                                         | `apps/web/src/workbench/state/wbCommands.ts` (reducer, label, merge) and its schema in `wbFile.ts`                                                  | `pnpm test`           |
| **Workbench: history, undo, rollback, merge window**                                                              | `apps/web/src/workbench/state/wbStore.ts`                                                                                                           | `pnpm test`           |
| **Workbench: saved file format** (`schemaVersion`, migrations), autosave                                          | `apps/web/src/workbench/state/wbFile.ts`, `persist.ts`, document shape in `wbDoc.ts`                                                                | `pnpm test`           |
| **Workbench: view state** (selection, display mode, environment, theme, units, panel sizes, layout presets)       | `apps/web/src/workbench/state/wbView.ts`                                                                                                            | `pnpm dev`            |
| **Work Surface types, defaults, limits, edge styles**                                                             | `packages/engine/src/surface/surface.ts` (`SURFACE_INFO`, `SURFACE_LIMITS`)                                                                         | `pnpm test`           |
| **Corrugation, tile, seam profile dimensions**                                                                    | `packages/engine/src/surface/profiles.ts` (render defaults, unverified)                                                                             | `pnpm test`           |
| **Hidden structure and attachment rule set per surface**                                                          | `packages/engine/src/surface/structure.ts` (`SURFACE_RULES`, unverified)                                                                            | `pnpm test`           |
| **Where the surface sits** (azimuth, pitch, lift, second-plane hinge, bounds)                                     | `packages/engine/src/surface/placement.ts`                                                                                                          | `pnpm test`           |
| **Surface textures** (concrete, zinc spangle, stone granules…)                                                    | `apps/web/src/workbench/scene/textureGen.ts`; noise in `workbench/lib/noise.ts`                                                                     | `pnpm test`           |
| **Surface 3D look** (deck, skin, screws, drains, pavers, structure members, outline)                              | `apps/web/src/workbench/scene/SurfaceBody.tsx`; meshes in `surfaceGeometry.ts`; materials in `materials.ts`                                         | `pnpm dev`            |
| **Lighting and environment presets, shadows, ground**                                                             | `apps/web/src/workbench/scene/environments.ts`, `SceneEnvironment.tsx`, `Ground.tsx`                                                                | `pnpm dev`            |
| **Camera moves, standard views, view cube**                                                                       | `apps/web/src/workbench/lib/camera.ts`, `scene/CameraRig.tsx`, `ui/ViewCube.tsx`                                                                    | `pnpm test`           |
| **Section plane**                                                                                                 | `apps/web/src/workbench/lib/section.ts`, `scene/SectionClip.tsx`, `ui/OptionsBar.tsx`                                                               | `pnpm test`           |
| **Workbench panels** (browser tree, library, properties, timeline, status bar, dialogs)                           | `apps/web/src/workbench/ui/` (one file per panel); layout in `Workbench.tsx`; styles in `workbench.css`                                             | `pnpm dev`            |
| **Length units and typed values** (`10ft`, `0.75m`)                                                               | `apps/web/src/workbench/lib/units.ts`                                                                                                               | `pnpm test`           |
| **The first-generation designer** (v1, `#/classic`)                                                               | `apps/web/src/classic/`, `app/`, `model/`, `panels/` (frozen; see PLAN.md section 0)                                                                | —                     |
| **How the auto-designer picks and wires a system** (inverter, strings, array shape, equipment, sizing loop)       | `apps/web/src/model/autoDesign.ts`                                                                                                                  | `pnpm test`           |
| **Auto-design defaults** (DC/AC limit, starting conductors, panel/rod/battery parts, default loads)               | `AUTO_DESIGN` in `apps/web/src/config/defaults.ts`                                                                                                  | `pnpm test`           |
| **New-project wizard** (steps, fields)                                                                            | `apps/web/src/app/NewProjectWizard.tsx`; answers → project in `apps/web/src/model/projectWizard.ts`                                                 | `pnpm dev`            |
| **Example projects** built by the auto-designer                                                                   | `autoExample(...)` calls in `apps/web/src/model/examples.ts`                                                                                        | `pnpm test`           |
| **Offline support** (service worker, precache list), app icons, manifest                                          | `serviceWorker()` in `apps/web/vite.config.ts`; `apps/web/public/manifest.webmanifest`, `icon-*.png`; registration `apps/web/src/app/registerSw.ts` | `pnpm build`          |
| **Which tabs load on demand**                                                                                     | `lazy(...)` in `apps/web/src/panels/BottomPanel.tsx`                                                                                                | `pnpm build`          |
| **Accessibility rules checked**                                                                                   | `apps/web/e2e/a11y.spec.ts` (axe-core tags)                                                                                                         | `pnpm e2e`            |
| **Hosting** (Netlify, Vercel, GitHub Pages)                                                                       | `netlify.toml`, `vercel.json`, `.github/workflows/pages.yml`; guide `docs/DEPLOY.md`                                                                | —                     |

Every number recalled from memory rather than a cited source is marked
`// VERIFY` and listed in `VERIFY.md`.

## How a value flows (so you know which layer to touch)

```
catalog JSON ──► model/ (glue) ──► engine (pure maths) ──► model/ ──► UI + 3D
 part data        arrayModel.ts      mounting/layout.ts      sceneModel.ts   panels/, scene/, parts/
                  buildLayoutInput   → positions, cut list,   all arrays,
                                       legs, issues           issues, BOM

sceneModel.ts runs, in order (one cached result per project + outage scenario):
  arrays → ports → raceways (racewayModel: fill, bends, cable routes)
         → ATS (atsModel) → nets + electrical (electricalModel, routed lengths)
         → protection (protectionModel) → grounding (groundingModel) → issues, BOM
reports/ builds documents from that scene model (pure), then renders them:
  calcSheet / sldReport / bomReport / checklist ──► ReportDoc ──► pdf.ts | xlsx.ts | csv.ts
user action ──► state/actions.ts ──► project document (undoable, autosaved)
```

- **Engine** (`packages/engine`) knows nothing about React, three.js or the
  catalog. It takes numbers and returns numbers, and it is fully unit-tested.
- **Model** (`apps/web/src/model`) is the only place that reads the catalog
  and calls the engine. It is pure and tested, with no React.
- **UI and 3D** only display what the model computed, and send edits through
  `state/actions.ts`.

## Recipes

### Add a new PV module

1. Copy an entry in `packages/catalog/src/data/pv-modules.json`, give it a new
   `id`, and enter the datasheet values. Keep `"verified": false` until checked.
2. `pnpm test`. The tests check that every module fits the single-diode model,
   that a clamp exists for its frame thickness, and that it lays out on a roof.

### Add a new clamp, L-foot or other hardware with a 3D model

1. Add the catalog entry to the right JSON file with `"modelUrl": "<id>.glb"`.
2. If an existing Blender script covers that kind (e.g. `module_clamps.py`
   loops over every clamp entry), run `pnpm models`. That's all.
3. For a new kind, copy a script in `tools/blender/parts/`, model it from the
   entry's `dimensions`/`mounting` numbers, add ports with `add_port()`, then run
   `pnpm models`. `build_all.py` fails if a `modelUrl` has no glb.

### Add a roof covering

1. Add it to `ROOF_SURFACES` in `packages/catalog/src/schema/mounting.ts`.
2. Add its look to `COVERING_INFO` and list it under the roof types in
   `apps/web/src/roofs/registry.ts`.
3. Add it to `compatibleSurfaces` of the attachments that suit it, and
   optionally to `PREFERRED_ATTACHMENT` in `config/defaults.ts`.

### Add an inverter

1. Add a row to `INVERTERS` in `packages/catalog/scripts/gen_inverters.py`
   (brand, model, kind, AC/PV ratings, MPPT window, MPPTs as
   `(strings, max input A, max Isc A)`, battery range, AC system, size, price).
2. `python3 packages/catalog/scripts/gen_inverters.py`. Ports (MC4 pairs per MPPT
   input, battery, AC, PE) are generated with the right polarity and gender.
3. `pnpm models` builds its 3D model; `pnpm test` validates it.

### Add a design rule

1. Add a code + title + explanation to `ISSUE_CODES` in `packages/engine/src/drc/issue.ts`.
2. Emit it with `issue(...)` from the engine module that checks it.
3. Add a passing and a failing test next to that module. The Issues tab shows
   it automatically.

### Add a user action (e.g. "mirror array")

1. Write the function in `apps/web/src/state/actions.ts` using `commit(label, recipe)`.
   That makes it undoable and autosaved.
2. Call it from a button in the inspector, or add a key in `app/shortcuts.ts`.
3. Add a test in `state/actions.test.ts`.

### Add a breaker, fuse, combiner, ATS or ground rod

1. Add a row to the matching table in `packages/catalog/scripts/gen_protection.py`
   (ratings, kA, poles, DIN width, ports).
2. `python3 packages/catalog/scripts/gen_protection.py`, then `pnpm models distribution`
   for its 3D model (`tools/blender/parts/distribution.py`).
3. If it is a new kind of device (not a breaker/fuse/isolator/ATS), say what it
   connects through in `apps/web/src/model/deviceLinks.ts` and which rule checks it
   in `apps/web/src/model/protectionModel.ts`.

### Add an example project

1. Add an entry to `EXAMPLES` and a builder in `apps/web/src/model/examples.ts`
   (fixed ids; cables by port key).
2. Add a test in `model/examples.test.ts` that it shows only the expected issues.

### Add a conduit type or trunking size

1. Add its internal diameters to `ID` and a row to `KINDS` (or a row to `TRUNKING`)
   in `packages/catalog/scripts/gen_raceway.py`, with its listings (wet, sun,
   burial, damage) and fitting family.
2. `python3 packages/catalog/scripts/gen_raceway.py`; `pnpm test` checks the areas.
3. Give it a colour in `RACEWAY.colors` (`config/defaults.ts`) and a label in
   `TYPE_LABELS` (`panels/inspector/RacewayInspector.tsx`) and the tool bar
   (`panels/RacewayToolBar.tsx`).

### Change a simulation rule (dispatch, battery, losses)

1. Edit the rule and its doc comment in `packages/engine/src/sim/dispatch.ts`
   (or `battery.ts`, `simulate.ts`) and its tests in `sim/sim.test.ts`.
2. Mirror the rule in the spreadsheet formulas in `tools/check/day_check.py`,
   run `python3 tools/check/day_check.py` (needs LibreOffice), then `pnpm test`:
   `dayCheck.test.ts` compares the engine with the spreadsheet hour by hour.
