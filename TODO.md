# TODO — not yet computed or not yet built

Values the UI shows as "not available", and deferred work.

## Shown as "not available" in the UI

- Code profile (Phase 1): toolbar chip.
- Issues / DRC (Phase 3), Calculations and Charts (Phase 1), BOM (Phase 2), Timeline (Phase 6).

## Deferred

- IndexedDB `ProjectStorage` implementation and autosave (Phase 2, with the scene).
- Typed schemas for the generic categories (rail, clamp, cable, conduit, din-device, …): currently `GenericPart` with free-form `attributes`.
- Catalog editor (form, JSON import/export UI, CSV import).
- Branded placeholder entries (see D-012, waiting for user answer).
- Bundle size: the R3F/drei chunk is ~1 MB (270 kB gzip). Tree-shake / lazy-load in Phase 8.
- Static hosting config (Vercel/Netlify) and PWA manifest/service worker (Phase 8).
