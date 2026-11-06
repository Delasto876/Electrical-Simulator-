# CLAUDE.md — working notes for this repo

**Solar Workbench** (brief v2): a CAD-style 3D solar PV and electrical design workbench. The
default app is `apps/web/src/workbench/`; the first-generation designer is kept at `#/classic`.
Read `PLAN.md` (architecture and phases),
`DECISIONS.md` (why), `VERIFY.md` (numbers a human must check), `TODO.md`.
**`docs/CHANGE_GUIDE.md` maps every kind of change to the one file that owns it. Keep it current when you add a layer or move a responsibility.**

## Commands (run from the repo root)

| Task                     | Command                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Install                  | `pnpm install`                                                                          |
| Dev server               | `pnpm dev` (http://localhost:5173)                                                      |
| Unit tests               | `pnpm test` (Vitest, projects: engine, catalog, web)                                    |
| Engine coverage (≥ 90 %) | `pnpm coverage`                                                                         |
| Lint / format / types    | `pnpm lint`, `pnpm format:check`, `pnpm typecheck`                                      |
| Production build         | `pnpm build`                                                                            |
| E2E + screenshots        | `pnpm e2e` (Playwright; writes `docs/screenshots/`)                                     |
| Preview link build       | `pnpm build:artifact` (then publish `apps/web/dist-artifact/`, see `docs/DEPLOY.md`)    |
| Regenerate 3D models     | `pnpm models` or `pnpm models <script_stem>` (needs bpy, see `tools/blender/README.md`) |

Before declaring a phase done: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`, then look at the screenshots.

## Conventions

- **Workbench** (`apps/web/src/workbench/`): state in `state/` (event-sourced: every user action is a
  command in `wbStore`, never mutate the doc elsewhere), UI in `ui/`, 3D in `scene/`. Ribbon buttons,
  command search and the marking menu all read one registry (`state/commandRegistry.ts`): add a
  command there once. Surface maths, structure and attachment rules live in
  `packages/engine/src/surface/` (pure, tested); the Workbench only draws them.
- Workbench CSS variables are prefixed `--wb-`; v1 CSS (`styles/app.css`) is only loaded by the classic route.
- Disabled commands must say why (`disabledReason`), e.g. "Arrives in Phase 3".

- TypeScript strict + `noUncheckedIndexedAccess`. No `any`.
- **Physics only in `packages/engine`.** No DOM/React/three imports there or in
  `packages/catalog` (eslint enforces). If a formula shows up in a component, move it.
- Every physics function documents units and sign conventions. Constants live in a
  named constants file with a source comment. Values recalled from memory get
  `// VERIFY` and an entry in `VERIFY.md`.
- Never fake a calculation: show "not available" and add to `TODO.md`.
- Catalog data is `verified: false` unless a human checked the datasheet. Field
  names carry units as suffixes (`vocV`, `weightKg`, `internalResistanceMohm`).
- Use electrician vocabulary in UI and code: string, MPPT, OCPD, EGC, GEC, bonding.
- 3D: fixed-shape parts are Blender glb files (`tools/blender/parts/*.py` →
  `apps/web/public/models/*.glb`, committed); spec-driven parts are procedural
  three.js. Ports in a glb are Empties with a `port_id` custom property (extras);
  never rely on glb node names (GLTFLoader sanitises them).
- Project file changes: bump `CURRENT_SCHEMA_VERSION` and add a migration; never
  edit a released migration.
- Toolchain pins: TypeScript 6.0.x (typescript-eslint supports < 6.1),
  @playwright/test 1.63.0 (matches the preinstalled Chromium in the cloud container).
- Screenshots: v1 uses `shot()` (`PHASE`), the Workbench uses `wbShot()` (`WB_PHASE`) in `apps/web/e2e/shots.ts`; bump when a phase starts so earlier screenshots are kept.
- Layering (web): `config/` defaults → `model/` (pure glue: catalog + engine, tested) →
  `state/actions.ts` (every edit, undoable via `commit`) → `panels/`, `scene/`, `parts/`
  (display only). No catalog lookups or maths in components.
- The 3D canvas renders on demand (`frameloop="demand"`): code that changes three.js
  objects outside React props must call `invalidate()`.
- e2e tests that click 3D objects by screen position run on the laptop project only;
  prefer selecting via the inspector's object list.
- Commit after every phase; stop for user review after each phase.
