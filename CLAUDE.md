# CLAUDE.md — working notes for this repo

3D solar PV and electrical design simulator. Read `PLAN.md` (architecture),
`DECISIONS.md` (why), `VERIFY.md` (numbers a human must check), `TODO.md`.

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
| Regenerate 3D models     | `pnpm models` or `pnpm models <script_stem>` (needs bpy, see `tools/blender/README.md`) |

Before declaring a phase done: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`, then look at the screenshots.

## Conventions

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
- Screenshots: bump `PHASE` in `apps/web/e2e/shots.ts` when a new phase starts so earlier phases' screenshots are kept.
- Commit after every phase; stop for user review after each phase.
