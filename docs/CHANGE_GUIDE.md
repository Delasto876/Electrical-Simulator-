# Change guide: where do I change X?

Every kind of change has **one** home. Find your change in the table, edit that
file, run the check in the last column. You should not need to touch anything
else.

## Quick map

| I want to change…                                                                                                 | Edit this                                                                                                           | Then run      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Defaults** the app starts with (roof, units, new array size, snap step, camera views, scene colours)            | `apps/web/src/config/defaults.ts`                                                                                   | `pnpm dev`    |
| **A part's numbers** (dimensions, electrical specs, price, ports)                                                 | `packages/catalog/src/data/<category>.json`                                                                         | `pnpm test`   |
| **Add a part** (new module, rail, clamp…)                                                                         | Add an entry to the matching `packages/catalog/src/data/*.json`                                                     | `pnpm test`   |
| **The 3D look of a fixed-shape part** (clamp, L-foot, later: inverter, MC4…)                                      | `tools/blender/parts/<part>.py` (reads sizes from the catalog JSON)                                                 | `pnpm models` |
| **The 3D look of a spec-driven part** (modules, rails, legs)                                                      | `apps/web/src/parts/` (`ModuleInstances.tsx`, `BoxInstances.tsx`) and `parts/registry.ts`                           | `pnpm dev`    |
| **Which renderer draws which category**                                                                           | `apps/web/src/parts/registry.ts`                                                                                    | `pnpm dev`    |
| **Roof types, roof coverings, their look**                                                                        | `apps/web/src/roofs/registry.ts` (UI) and `packages/engine/src/site/roof.ts` (geometry)                             | `pnpm test`   |
| **How arrays are laid out** (rail overhang, clamp-zone position, default spacing, setback, row-shading sun angle) | `packages/engine/src/mounting/rules.ts`                                                                             | `pnpm test`   |
| **Layout logic** (where rails/clamps/feet/legs go, leg-length formula, rail cutting)                              | `packages/engine/src/mounting/layout.ts`, `tilt.ts`, `railCut.ts`                                                   | `pnpm test`   |
| **Which clamp/attachment is picked automatically**                                                                | `apps/web/src/model/hardware.ts` (logic) and `PREFERRED_ATTACHMENT` in `config/defaults.ts` (preferences)           | `pnpm test`   |
| **Design-rule wording** (issue titles, beginner explanations)                                                     | `packages/engine/src/drc/issue.ts` (`ISSUE_CODES`)                                                                  | `pnpm test`   |
| **Code tables and limits** (ampacity, derating, voltage-drop limits)                                              | `packages/engine/src/profiles/` and `packages/engine/src/conductors/tables.ts`                                      | `pnpm test`   |
| **Physics constants** (with sources)                                                                              | `packages/engine/src/constants.ts`                                                                                  | `pnpm test`   |
| **What a user action does** (add/move/delete array, roof edits, undo labels)                                      | `apps/web/src/state/actions.ts`: every edit lives here                                                              | `pnpm test`   |
| **Keyboard shortcuts**                                                                                            | `apps/web/src/app/shortcuts.ts` (the `?` overlay reads the same list)                                               | `pnpm dev`    |
| **How lengths, weights and money are displayed**                                                                  | `apps/web/src/lib/format.ts`                                                                                        | `pnpm dev`    |
| **BOM pricing** (per-metre rails, totals)                                                                         | `apps/web/src/model/bomPricing.ts`                                                                                  | `pnpm test`   |
| **Inspector panels**                                                                                              | `apps/web/src/panels/inspector/` (one file per selection type)                                                      | `pnpm dev`    |
| **Result tabs** (Issues, BOM, Charts, Calculations)                                                               | `apps/web/src/panels/results/`, `panels/charts/`, `panels/calcs/`                                                   | `pnpm dev`    |
| **Saved project format**                                                                                          | `apps/web/src/project/projectFile.ts`: bump `CURRENT_SCHEMA_VERSION` and **add** a migration                        | `pnpm test`   |
| **UI colours / theme**                                                                                            | CSS variables at the top of `apps/web/src/styles/app.css`                                                           | `pnpm dev`    |
| **Port keys and port world positions** (modules, parts, array PE lug)                                             | `apps/web/src/model/ports.ts`                                                                                       |
| **Strings** (auto-string, chunking, string ends)                                                                  | `apps/web/src/model/strings.ts`                                                                                     |
| **Default cable for a port type**, cable colours                                                                  | `apps/web/src/config/defaults.ts` (`DEFAULT_CABLE_FOR_PORT`, `CABLE_COLORS`)                                        |
| **Which ports may be cabled together** (MC4 ↔ DC terminal, battery lugs…)                                         | `CABLE_PAIRS` in `packages/engine/src/drc/electrical.ts`                                                            |
| **DC string/MPPT/battery checks** (Voc, Vmp, polarity, cable sizing, DC disconnect, battery fuse)                 | `apps/web/src/model/electricalModel.ts` (glue) → `packages/engine/src/strings/`, `drc/electrical.ts`, `protection/` |
| **Inverters** (models, MPPTs, ports)                                                                              | `packages/catalog/scripts/gen_inverters.py` (regenerates `data/inverters.json`)                                     |
| **Breakers, fuses, combiners, enclosures, ATS, rods, utility, generator, loads** (catalog)                        | `packages/catalog/scripts/gen_protection.py` (regenerates the matching `data/*.json`)                               |
| **What a device connects through** (breaker poles, fuse in↔out, ATS slots)                                        | `apps/web/src/model/deviceLinks.ts`                                                                                 |
| **Connectivity** (wire nets, reach through devices)                                                               | `apps/web/src/model/nets.ts`                                                                                        |
| **Breaker / fuse / combiner rules** (kA, voltage, rating, conductor protection, polarity)                         | `apps/web/src/model/protectionModel.ts` (glue) → `packages/engine/src/protection/ocpd.ts`                           |
| **Inverter capacity vs loads, battery current**                                                                   | `packages/engine/src/protection/capacity.ts`                                                                        |
| **Code tables for protection** (standard OCPD sizes, EGC table, GEC minimum, rod target)                          | `protection` in `packages/engine/src/profiles/necGeneric.ts` (and other profiles)                                   |
| **Grounding & bonding rules** (floating metal, rods, EGC/GEC sizes)                                               | `apps/web/src/model/groundingModel.ts` → `packages/engine/src/grounding/groundRod.ts`                               |
| **ATS behaviour** (priority, nested, checks)                                                                      | `packages/engine/src/ats/atsLogic.ts`; wiring detection in `apps/web/src/model/atsModel.ts`                         |
| **DIN rail geometry, slot placement, mounted-device pose**                                                        | `apps/web/src/model/placement.ts`                                                                                   |
| **What a part can be swapped for**                                                                                | `apps/web/src/model/swap.ts`                                                                                        |
| **Example projects** (Examples menu)                                                                              | `apps/web/src/model/examples.ts` (tested in `examples.test.ts`)                                                     |
| **Camera framing (F)**                                                                                            | `apps/web/src/app/focus.ts`                                                                                         |
| **Conduit / trunking types and sizes** (internal diameter, OD, listings, prices, fittings)                        | `packages/catalog/scripts/gen_raceway.py` (regenerates `conduits.json`, `conduit-fittings.json`, `trunking.json`)   |
| **Raceway code limits** (fill %, 360° rule, bend radii, support spacing, PVC expansion)                           | `raceway` in `packages/engine/src/profiles/necGeneric.ts`                                                           |
| **Raceway maths** (bends, fillets, mitres, fill, packing, expansion, stock cutting)                               | `packages/engine/src/raceway/`                                                                                      |
| **Raceway rules, cable routing through raceways, raceway BOM**                                                    | `apps/web/src/model/racewayModel.ts`                                                                                |
| **What a new run starts as** (default conduit/trunking, location, colours)                                        | `RACEWAY` in `apps/web/src/config/defaults.ts`                                                                      |
| **How drawing works** (point placement, risers, finish/undo)                                                      | `apps/web/src/app/racewayTool.ts`                                                                                   |
| **Raceway 3D look** (tube, fittings, mitred pieces, cut labels)                                                   | `apps/web/src/scene/RacewayObjects.tsx`                                                                             |
| **Raceway inspector / Cut list tab**                                                                              | `apps/web/src/panels/inspector/RacewayInspector.tsx`, `apps/web/src/panels/results/CutList.tsx`                     |

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
