# Your own parts (drop-in folder)

Put one folder per product in this directory. The app loads every folder at start
(`pnpm dev`, `pnpm build`); the parts appear under **My parts** in the Parts Library,
ready to place, snap, wire and count in the BOM. No wizard needed.

```
assets/user-parts/
  user-hager-mcb-20a/        folder name = the part id (lower case, digits, dashes)
    part.json                the data (see _sample/part.json)
    front.png                photo(s) named in part.json "images"
    left.jpg
```

- **Photos**: PNG, JPG or WebP. Straight-on photos work best. Use the in-app wizard
  (Parts Library → _Add custom part_) if the photo needs straightening, cropping,
  background removal or a scale; export the result as a `.partpack` and unzip it here.
- **Slots** in `"images"`: `front`, `left`, `right`, `top`, `back`, `inside`, `label`, `terminals`.
- **Templates** (`"template"`): `din-breaker`, `din-enclosure`, `transfer-switch`.
  Their `"specs"` fields are listed in `apps/web/src/workbench/model/customPackage.ts` (`SPEC_FIELDS`).
- **Sizes** are in millimetres: `dimsMm` = width across the front, height, depth.
  A DIN breaker is `modules × 18 mm` wide and snaps onto a 35 mm rail by modules.
- Folders whose name starts with `_` are templates and are not loaded.

Everything here is marked **user-verified**: the numbers are only as good as what you
typed. Copy values from the manufacturer's datasheet and keep the datasheet with the job.
A part pack (`.partpack`) is the same layout in a zip file: you can unzip it into this
folder or import it from the Parts Library.
