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

- Phase 2: Parts Library thumbnails from the 3D models, drag and drop with ghost, joints and snapping, L-foot / base plate / legs, precision system (live dimensions, Tab-to-type, rulers, guides, Measure), custom part wizard (breaker, enclosure, ATS).
- Surface photo textures and scale calibration (Phase 2); drilled holes in concrete (CSG) and attachment point markers (Phase 2).
- Seamless-tile upload for surfaces; rail/clamp profile tracing (Phase 2/3).
- Drag-to-resize handles on the 3D surface; second plane as its own tree node; more than one surface.
- Postprocessing (SSAO, SMAA, bloom), HDRI, quality presets, Render button (Phase 4).
- Touch gestures and tablet layout of the Workbench (it is laptop-first now); embeddable iframe mode with a configurable brand.
- Branching history (the timeline is linear: an edit after a rollback discards the rest, see D-094).
- Port the v1 features (wiring, protection, raceway, simulation, reports, wizard) into the Workbench phase by phase, then retire `#/classic`.
