# TODO — not yet computed or not yet built

Values the UI shows as "not available", and deferred work.

## Shown as "not available" in the UI

- Design current of AC breakers fed from a source with no known load (e.g. the inverter AC input breaker): shown as "not available"; the inverter AC input current rating is not in the catalog yet.
- Fault current where no source with a known fault level is reached (unwired devices).
- I–V curve when the single-diode fit fails: the UI shows quick-mode numbers and "I–V curve not available".

## Deferred

- Typed schemas for the remaining generic categories (cable, connector, conduit, din-device, …): currently `GenericPart` with free-form `attributes`.
- Catalog editor (form, JSON import/export UI, CSV import).
- Branded placeholder entries (see D-012, waiting for user answer).
- Bundle size: the R3F/drei chunk is still ~1 MB (278 kB gzip); chart tabs already load on demand.
- IEC-generic code profile: needs IEC 60364-5-52 ampacity tables (Jamaica preset done in Phase 3).
- Metric (mm²) ampacity: only resistance tables exist so far; the calculator is AWG-only.
- AC steady-state (RMS with power factor) solver; voltage drop for AC is available as a formula only.
- Hip roofs and obstructions (chimney, tank, tree, wall); walls/room mode for the electrical room.
- Measure tool (distance/angle); angle snap; group; copy/paste between projects; transform gizmos (move/rotate via drag + R works).
- Attachments on corrugated roofs should land on crests and on purlins/rafters (structure spacing not modelled yet).
- Ballast blocks, ground screws and footings for tilted/ground mounts; diagonal braces in the BOM.
- Rails running up the slope (for landscape with long-edge-only modules); shared rails between rows.
- Simplified wind uplift per fastener (rule + catalog ratings exist; calculation not yet).
- Tablet/touch interaction e2e tests (3D-click tests run on the laptop project only).
- Blender models for tile hooks, seam clamps and standoffs (boxes for now).
- MC4 crimp-and-assemble animation; Y-branch and extension-cable usage in strings (catalog entries exist).
- Cable bend-point editing and auto-route along rails/raceways (the user routes cables through raceways they draw; outside raceways routes are simple orthogonal polylines).
- Battery bank builder (series/parallel, busbars); C-rate/BMS checks beyond the continuous-current check.
- AC load-flow (voltage drop per branch under load, neutral current on split-phase); Phase 4 checks ratings, kA, capacity and topology only.
- Converting the String Wizard's "Apply" for controllers with one MPPT and several parallel strings via Y-branches.
- Snap animation when a DIN device clicks onto the rail; drag devices between slots (they take the first free slot now).
- Busbars, neutral bars and N–G bond as explicit parts (the PE bar is a port of the enclosure).
- Project list to reopen a previous design after loading an example (it stays in IndexedDB).
- Rapid-shutdown devices (module-level) in the catalog; the rule exists.
- Arc-fault (AFCI) and GFCI/RCD requirement rules; SPD coordination.
- Separately derived generator (switched-neutral) analysis beyond the ATS_NEUTRAL warning.
- Grounding: supplementary electrodes other than rods (Ufer, ring, plate); measured resistance entry.
- Raceways: EMT, rigid (RMC/IMC) and Schedule 80 elbow radii; editing points by dragging in 3D (points are edited in the inspector now); inserting a point mid-run.
- Trunking tees, inside/outside corner fittings and covers as separate items (corners are mitred).
- Cables leaving a raceway part-way (a cable goes end to end through each raceway it is in).
- PVC expansion per straight run between fixed points (checked per whole run now); expansion fitting placement.
- Pull tension / sidewall pressure; jam ratio for three conductors.
- Neutral counted as current-carrying always (NEC 310.15(E) exceptions not modelled).
- Bonding jumpers for metal raceways; FMC/LFMC as EGC length limits.
- Straps and couplings drawn in 3D (counted in the BOM only).
- Simulation: several inverters dispatched separately (one hybrid inverter drives the whole system now); grid charging of the battery; time-of-use tariffs; generator fuel use; battery ageing and temperature model; bifacial gain; horizon profile; a typical-year (TMY) option and an offline monthly table per city.
- Loads not on the backed-up output (grid-only circuits) are not simulated; neutral current and AC voltage drop per branch under load.
- Cable flow animation (cables are coloured by current at the slider time; no moving dashes).
- Per-array POA and shading figures in the inspector at the slider time (the Simulation tab shows system values).
- Reports: quotation / pricing was left out on request; panel schedule per enclosure; labels as printable stickers; SLD manual layout overrides and enclosure boundaries drawn around their devices; Excel export of the checklist.
- PDF: embed a Unicode font so Ω, ≤ and − print as symbols (spelled out now).
- Published preview page: Open-Meteo and place search are blocked by the page host, so the simulation there uses the clear-sky estimate (labelled); real weather works in the local app.
- Auto-design: three-phase systems, several inverters, AC coupling, a generator/ATS option, raceways, SPDs and rapid-shutdown devices (shown as notes/warnings instead).
- Tablet/touch e2e for 3D picking; screen-reader description of the 3D scene beyond the object list.

## Workbench (brief v2), after Phase 1

- (Done in Phase 2: Parts Library thumbnails, drag and drop, snapping, L-foot / base plate / legs, precision system.) Was: Parts Library thumbnails from the 3D models, drag and drop with ghost, joints and snapping, L-foot / base plate / legs, precision system (live dimensions, Tab-to-type, rulers, guides, Measure), custom part wizard (breaker, enclosure, ATS).
- Surface photo textures and scale calibration of a _surface_ (the custom-part wizard has its own scale calibrator); real CSG drilling of the slab (holes are drawn as discs now, D-113).
- Seamless-tile upload for surfaces; rail/clamp profile tracing (Phase 2/3).
- Drag-to-resize handles on the 3D surface; second plane as its own tree node; more than one surface.
- Postprocessing (SSAO, SMAA, bloom), HDRI, quality presets, Render button (Phase 4).
- Touch gestures and tablet layout of the Workbench (it is laptop-first now); embeddable iframe mode with a configurable brand.
- Branching history (the timeline is linear: an edit after a rollback discards the rest, see D-094).
- Port the v1 features (wiring, protection, raceway, simulation, reports, wizard) into the Workbench phase by phase, then retire `#/classic`.

## Workbench (brief v2), after Phase 2

- Dragging a placed part with the mouse (move is by typed distances in Properties now); Align, Mirror, Copy/paste, Group, Pattern (rows × columns of feet) are listed in the ribbon as "Arrives in Phase 10".
- Dimension (persistent editable dimension) and Set origin tools; the Measure tool measures distance only (angle and area to come).
- Custom parts: side/back/top photos are stored but only the front photo is mapped on the 3D body; terminal markers are stored but wires attach to them in Phase 6; HEIC photos need conversion to JPG/PNG first; a datasheet PDF cannot be attached yet.
- Custom part templates beyond DIN breaker, DIN enclosure and transfer switch (inverter, battery, module, combiner); a photo-to-3D "auto build" beyond a textured box.
- Snap menu: the five snap toggles live in the status bar; a per-snap tolerance setting and a "snap to part edges" mode are not built.
- Rulers are always along the surface edges (left and up-slope); user origin and rulers in other units than the display unit are not available.
- Guides are per document, not per surface; only one surface is used until the multi-surface work.
- Part thumbnails of parts with a glb are drawn from the model; parts with a procedural look are a plain box until their Blender model exists.
- Modules, rails, splices and clamps are still "Arrives in Phase 3"; tilt legs are placed on their own, the module frame they carry comes with modules.

## Workbench (brief v2), after Phase 3

- Mounting Layout Drawing (top view, auto-dimensioned, PDF/DXF) from §6B: not built yet (the BOM and Issues tab are live).
- Rail placement snaps sideways to rows of feet only; rails on tilt legs work through the leg tops, but leg rows are not offered as a separate "rail on legs" mode, and modules on tilted rails are tilted from the rail heights (no separate tilt frame object).
- The clamp glb models are not used for placed clamps (procedural clamps; D-122). Bolts are shown as heads, no thread normal maps (Phase 4 realism).
- Expansion joints: the RAIL_RUN_EXPANSION rule warns, but a splice cannot yet be marked as an expansion joint (gap) to clear it.
- Moving a module or a rail by mouse drag (move is by Properties fields); modules can be deleted and re-placed. Module rotation other than 0° on the surface is not offered.
- Clamp Add mode snaps to the nearest frame edge; there is no "drag a clamp along the rail".
- WEEB lugs, bonding jumpers and the bonding path through clamps and splices are Phase 8.
- Cut indicator snaps (midpoint, attachments, clamps, 10 mm steps) are fixed; a step selector (10/50/100 mm) is not in the options bar.

## Workbench (brief v2), after Phase 4

- Desktop app (installable like Fusion 360): wrap the PWA build with Tauri or Electron, file associations, auto-update (Phase 10). The app already works offline as a PWA.
- Move/Pattern drag arrows work in the surface plane; rotating by dragging a ring, and a circular pattern, are not built. Align, Group/Ungroup, Set origin, Dimension are still listed as Phase 10.
- Mirror lines are the surface centre lines, guides and typed positions; mirroring across another part's face is not available. Splices are not copied.
- Surfaces on planes are placed by typed position; dragging a surface in 3D and snapping a wall to a roof edge are not built. Guides belong to the first surface only.
- Device models hung on a wall: catalog glb models are rotated so their up runs up the wall; a model whose front is not its +Z face will face the wall (check each model when photos arrive).
- Fusion's sketch tools (line, rectangle, circle, extrude) have no equivalent here; the shortcut letters they use are free.

## Workbench (brief v2), after Phase 5

- Inverter datasheets were read through web search only (the maker sites are not reachable from the build machine); a human should check each brand entry against the PDF and set `verified: true` (see VERIFY.md).
- No Blender models yet for the new brand inverters (Luxpower SNA 6000 WPV, Deye SUN-6K-SG05LP1-EU, Growatt SPF 6000 ES Plus, SRNE ASF4880S180-H) or the HT boxes: they are drawn as procedural boxes. Model them when the user's photos arrive.
- Changeover switches and the DIN ATS do not conduct in the circuit model yet; the ATS source priority and transfer behaviour are Phase 7.
- N and PE bars, cable glands, wires inside the box and labels printed on the device fronts are not drawn yet (Phase 6 wiring).
- Kits are fixed lists; a "save this box as a ready-made box" command (from a box built by hand) is not built.
- Covers open in place; an exploded "take the cover off and lay it beside the box" view is not built.

## Workbench (brief v2), after Phase 6

- Dragging moves parts in the surface plane; snapping a dragged foot onto the structure (like placing) and dragging a part from one surface to another are not built. Clamps and DIN devices follow their rail or box but cannot be dragged on their own.
- The view cube cannot roll the view (Fusion's arrows rotate about the view direction); its arrows turn the model 90° about the vertical axis instead.
- The coloured icons are lucide icons tinted by group; hand-drawn product icons like Fusion's are not made.
- The 615, 625, 665 and 700 W modules are estimated classes, not products; replace them with the modules you buy.
- Wiring and raceways are Phase 7 now.
