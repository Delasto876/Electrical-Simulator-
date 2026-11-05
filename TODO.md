# TODO — not yet computed or not yet built

Values the UI shows as "not available", and deferred work.

## Shown as "not available" in the UI

- Issues / DRC (Phase 3), BOM (Phase 2), Timeline (Phase 6).
- I–V curve when the single-diode fit fails: the UI shows quick-mode numbers and "I–V curve not available".

## Deferred

- IndexedDB `ProjectStorage` implementation and autosave (Phase 2, with the scene).
- Typed schemas for the generic categories (rail, clamp, cable, conduit, din-device, …): currently `GenericPart` with free-form `attributes`.
- Catalog editor (form, JSON import/export UI, CSV import).
- Branded placeholder entries (see D-012, waiting for user answer).
- Bundle size: the R3F/drei chunk is ~1 MB (270 kB gzip). Tree-shake / lazy-load in Phase 8.
- Static hosting config (Vercel/Netlify) and PWA manifest/service worker (Phase 8).
- IEC-generic and Jamaica code profiles (Phase 3, with string sizing). IEC needs IEC 60364-5-52 ampacity tables.
- Metric (mm²) ampacity: only resistance tables exist so far; the calculator is AWG-only.
- Series/parallel string I–V, bypass diodes under partial shading, mismatch (Phase 3/6). The MNA solver has no diode element yet.
- AC steady-state (RMS with power factor) solver; voltage drop for AC is available as a formula only.
- Plane-of-array irradiance, weather providers (Phase 6).
