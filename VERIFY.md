# VERIFY — values a human must check against a current source

Anything here came from memory or is a placeholder. Check it against the
current code book, utility rules or manufacturer datasheet, then remove the
`// VERIFY` marker in code and the row here.

| Where                                       | What                                                             | Check against                                   |
| ------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `packages/catalog/src/data/*.json`          | All bundled part specs (generic placeholders, `verified: false`) | Datasheets of the products you actually install |
| `packages/catalog/src/data/pv-modules.json` | MC4 gender on module leads (+ female, − male), D-013             | Module datasheet / connector manufacturer       |
| `tools/blender/lib/common.py`               | PBR material colours/roughness are visual approximations         | Not safety-relevant; adjust to taste            |
