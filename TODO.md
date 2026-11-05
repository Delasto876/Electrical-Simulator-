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
- IEC-generic and Jamaica code profiles (Phase 3, with string sizing). IEC needs IEC 60364-5-52 ampacity tables.
- Metric (mm²) ampacity: only resistance tables exist so far; the calculator is AWG-only.
- Series/parallel string I–V, bypass diodes under partial shading, mismatch (Phase 3/6). The MNA solver has no diode element yet.
- AC steady-state (RMS with power factor) solver; voltage drop for AC is available as a formula only.
- Plane-of-array irradiance, weather providers (Phase 6).
- Hip roofs and obstructions (chimney, tank, tree, wall); walls/room mode for the electrical room.
- Measure tool (distance/angle); angle snap; group; copy/paste between projects; transform gizmos (move/rotate via drag + R works).
- Attachments on corrugated roofs should land on crests and on purlins/rafters (structure spacing not modelled yet).
- Ballast blocks, ground screws and footings for tilted/ground mounts; diagonal braces in the BOM.
- Rails running up the slope (for landscape with long-edge-only modules); shared rails between rows.
- Simplified wind uplift per fastener (rule + catalog ratings exist; calculation not yet).
- Port snapping between parts in the scene: compatibility rules exist (`engine/ports/compat.ts`) and ports are shown on placed parts; the cable tool uses them in Phase 3.
- Tablet/touch interaction e2e tests (3D-click tests run on the laptop project only).
- Blender models for inverters, batteries, tile hooks, seam clamps and standoffs (boxes for now).
- Branded placeholder entries (D-012) and MC4 gender convention (D-013): open questions to the user.
