# CLAUDE.md — working notes for this repo

**Read `HANDOFF.md` first** (what exists, gap table, key files). Requirements: `END-GOAL.md`.
**Update `HANDOFF.md` after every slice** (status table, changed paths, conventions), then commit.
Do not read the whole repository; `docs/CHANGE_GUIDE.md` maps each kind of change to its file.

## Commands (repo root; Node >= 22, pnpm 10.28)

| Task                  | Command                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Install               | `pnpm install --frozen-lockfile`                                 |
| Dev server            | `pnpm dev` (http://localhost:5173, Classic at `/#/classic`)      |
| Unit tests            | `pnpm test` (Vitest projects: engine, catalog, web)              |
| One test file         | `pnpm vitest run --project web <path>`                           |
| Engine coverage       | `pnpm coverage` (must stay >= 90 %)                              |
| Lint / format / types | `pnpm lint`, `pnpm format:check`, `pnpm typecheck`               |
| Build                 | `pnpm build`                                                     |
| E2E + screenshots     | `pkill -f "vite.js preview"; pnpm e2e -- --trace off`            |
| One E2E spec          | `cd apps/web && npx playwright test e2e/<spec> --project laptop` |
| Preview bundle        | `pnpm build:artifact` (see `docs/DEPLOY.md`)                     |
| Regenerate catalog    | `python3 packages/catalog/scripts/<gen>.py`, then prettier       |
| Regenerate 3D models  | `pnpm models` (needs bpy, `tools/blender/README.md`)             |

Gate before calling a slice done:
`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`, the E2E specs you
touched, then look at the screenshots.

## Coordinates and units

- Surface frame: **x across** (rail direction, along the eave), **z down the slope**, **y** along
  the surface normal. World: x east, **y up**, z south.
- Walls are surfaces at pitch 90° with `originM`; devices hang with their height up the wall.
- Document: metres and degrees. `rotDeg` turns about the surface normal; a rail runs along
  (cos, sin) of it, so rails across the slope have `rotDeg` 0.
- Catalog: millimetres and SI with unit suffixes (`lengthMm`, `vocV`, `weightKg`).
- Engine functions document their units and sign conventions.
- UI lengths follow the chosen unit (mm, cm, m, in, ft, ft-in); typed values accept expressions.

## Rules

- **Physics only in `packages/engine`** (no DOM, React or three imports there or in
  `packages/catalog`; eslint enforces). No formula in a component.
- Workbench state is event-sourced: every edit is a command in `state/wbCommands.ts`; never
  mutate the doc elsewhere. Add a UI command once, in `state/commandRegistry.ts`.
- Layers: `state/` (doc, commands, tool actions) → `model/` (pure glue, tested) → `scene/`, `ui/`
  (display only).
- Never fake a calculation: show "not available" and add it to `TODO.md`.
- Numbers from memory get `// VERIFY` and a row in `VERIFY.md`. Catalog data stays
  `verified: false` until a human checks the datasheet.
- Document shape change: bump `WB_SCHEMA_VERSION`, add a migration in `state/wbFile.ts`, never
  edit a released migration, update the `schemaVersion` literal in `e2e/workbench.spec.ts`.
- Disabled commands say why (`disabledReason`).
- The canvas renders on demand: code that changes three.js objects outside React props calls
  `invalidate()`.
- TypeScript strict with `noUncheckedIndexedAccess`; no `any`.
- Electrician vocabulary in UI and code: string, MPPT, OCPD, EGC, GEC, bonding.
- Log decisions in `DECISIONS.md`; keep `docs/CHANGE_GUIDE.md` current.
- E2E: prefer selecting through the Browser tree or typed positions; clicks by screen position are
  flaky. Screenshots use `wbShot()` (`apps/web/e2e/shots.ts`, bump `WB_PHASE` per phase).
- Toolchain pins: TypeScript 6.0.x, @playwright/test 1.63.0 (matches the preinstalled Chromium).
