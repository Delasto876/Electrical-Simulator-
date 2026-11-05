# TODO — not yet computed or not yet built

Values the UI shows as "not available", and deferred work.

## Shown as "not available" in the UI

- Electrical DRC rules (Phase 3), Timeline (Phase 6). The Issues tab shows mounting/placement rules now.
- I–V curve when the single-diode fit fails: the UI shows quick-mode numbers and "I–V curve not available".

## Deferred

- Typed schemas for the remaining generic categories (cable, connector, conduit, din-device, …): currently `GenericPart` with free-form `attributes`.
- Catalog editor (form, JSON import/export UI, CSV import).
- Branded placeholder entries (see D-012, waiting for user answer).
- Bundle size: the R3F/drei chunk is ~1 MB (270 kB gzip). Tree-shake / lazy-load in Phase 8.
- Static hosting config (Vercel/Netlify) and PWA manifest/service worker (Phase 8).
- IEC-generic code profile: needs IEC 60364-5-52 ampacity tables (Jamaica preset done in Phase 3).
- Metric (mm²) ampacity: only resistance tables exist so far; the calculator is AWG-only.
- Bypass diodes under partial shading and mismatch between modules at different conditions (Phase 6, with shading). Strings are solved with identical modules at STC for now.
- AC steady-state (RMS with power factor) solver; voltage drop for AC is available as a formula only.
- Plane-of-array irradiance, weather providers (Phase 6).
- Hip roofs and obstructions (chimney, tank, tree, wall); walls/room mode for the electrical room.
- Measure tool (distance/angle); angle snap; group; copy/paste between projects; transform gizmos (move/rotate via drag + R works).
- Attachments on corrugated roofs should land on crests and on purlins/rafters (structure spacing not modelled yet).
- Ballast blocks, ground screws and footings for tilted/ground mounts; diagonal braces in the BOM.
- Rails running up the slope (for landscape with long-edge-only modules); shared rails between rows.
- Simplified wind uplift per fastener (rule + catalog ratings exist; calculation not yet).
- Tablet/touch interaction e2e tests (3D-click tests run on the laptop project only).
- Blender models for tile hooks, seam clamps and standoffs (boxes for now).
- MC4 gender convention on module leads (D-013): open question to the user.
- MC4 crimp-and-assemble animation; Y-branch and extension-cable usage in strings (catalog entries exist).
- Cable bend-point editing and auto-route along rails/raceways (Phase 5); routes are simple orthogonal polylines now.
- Battery bank builder (series/parallel, busbars), C-rate/BMS checks, battery fuse (Phase 4).
- AC side wiring checks (AC terminals connect, but AC circuits are not analysed yet: Phase 4).
- MPPT operating point under real irradiance/temperature (Phase 6 time series); STC only now.
- Converting the String Wizard's "Apply" for controllers with one MPPT and several parallel strings via Y-branches.
