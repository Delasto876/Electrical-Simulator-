import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import {
  CUSTOM_TEMPLATES,
  IMAGE_SLOTS,
  type CustomPart,
  type CustomTemplate,
  type ImageSlot,
} from "../state/customParts";

/**
 * CUSTOM PART PACKAGES — one folder layout for everything: the `.partpack`
 * file you export and import (a zip), and the drop-in folder
 * `assets/user-parts/<part-id>/` the app loads at start. Each part is
 * `part.json` plus its photos next to it; `part.json` names the photo files.
 */
export const PART_FORMAT = "solar-workbench-part";

export const TEMPLATE_LABEL: Record<CustomTemplate, string> = {
  "din-breaker": "DIN-rail breaker",
  "din-enclosure": "DIN enclosure",
  "transfer-switch": "Transfer switch (ATS)",
};

export interface SpecField {
  key: string;
  label: string;
  kind: "number" | "text" | "choice";
  choices?: string[];
  default: string | number;
  unit?: string;
}

/** The fields each template asks for. */
export const SPEC_FIELDS: Record<CustomTemplate, SpecField[]> = {
  "din-breaker": [
    {
      key: "kind",
      label: "Kind",
      kind: "choice",
      choices: ["MCB", "RCBO", "RCD", "isolator", "DC breaker", "SPD"],
      default: "MCB",
    },
    { key: "poles", label: "Poles", kind: "number", default: 1 },
    { key: "modules", label: "Width in 18 mm modules", kind: "number", default: 1 },
    { key: "ratedCurrentA", label: "Rated current", kind: "number", default: 20, unit: "A" },
    {
      key: "curve",
      label: "Trip curve",
      kind: "choice",
      choices: ["B", "C", "D", "K", "Z", "none"],
      default: "C",
    },
    {
      key: "breakingCapacityKA",
      label: "Breaking capacity",
      kind: "number",
      default: 6,
      unit: "kA",
    },
    { key: "ratedVoltageV", label: "Rated voltage", kind: "number", default: 230, unit: "V" },
    { key: "dc", label: "Current type", kind: "choice", choices: ["AC", "DC"], default: "AC" },
  ],
  "din-enclosure": [
    { key: "modulesPerRow", label: "Modules per DIN row", kind: "number", default: 12 },
    { key: "rows", label: "DIN rows", kind: "number", default: 1 },
    { key: "ip", label: "IP rating", kind: "text", default: "IP65" },
    {
      key: "material",
      label: "Material",
      kind: "choice",
      choices: ["plastic", "metal"],
      default: "plastic",
    },
  ],
  "transfer-switch": [
    {
      key: "kind",
      label: "Kind",
      kind: "choice",
      choices: ["automatic", "manual"],
      default: "automatic",
    },
    { key: "poles", label: "Poles", kind: "number", default: 2 },
    { key: "ratedCurrentA", label: "Rated current", kind: "number", default: 63, unit: "A" },
    { key: "ratedVoltageV", label: "Rated voltage", kind: "number", default: 230, unit: "V" },
    { key: "transferTimeMs", label: "Transfer time", kind: "number", default: 50, unit: "ms" },
  ],
};

/** Starting size [mm] for each template. */
export const DEFAULT_DIMS: Record<CustomTemplate, { w: number; h: number; d: number }> = {
  "din-breaker": { w: 18, h: 90, d: 65 },
  "din-enclosure": { w: 200, h: 250, d: 100 },
  "transfer-switch": { w: 250, h: 330, d: 150 },
};

const Terminal = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["screw", "spring", "lug", "mc4", "bus"]),
  polarity: z.enum(["+", "-", "L1", "L2", "L3", "N", "PE", "none"]),
  ratingA: z.number().nullable(),
  wireRange: z.string(),
  torqueNm: z.number().nullable(),
  face: z.enum(["front", "inside"]),
  u: z.number().min(0).max(1),
  v: z.number().min(0).max(1),
});

const Dims = z.object({
  w: z.number().positive().max(5000),
  h: z.number().positive().max(5000),
  d: z.number().positive().max(5000),
});

const PartMeta = z.object({
  format: z.literal(PART_FORMAT).optional(),
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id: lower-case letters, digits and dashes"),
  template: z.enum(CUSTOM_TEMPLATES),
  name: z.string().min(1).max(120),
  brand: z.string().max(80).default(""),
  model: z.string().max(80).default(""),
  dimsMm: Dims,
  weightKg: z.number().min(0).max(2000).default(0),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  terminals: z.array(Terminal).default([]),
  approximate: z.boolean().default(true),
  createdAt: z.string().default(() => new Date(0).toISOString()),
});

/** part.json on disk: the photos are file names next to it. */
export const PartJsonSchema = PartMeta.extend({
  images: z.partialRecord(z.enum(IMAGE_SLOTS), z.string()).default({}),
});

export class PackageError extends Error {}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** A fresh unique id for a new part. */
export function newPartId(name: string, taken: ReadonlySet<string>): string {
  const base = `user-${slug(name) || "part"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export interface Draft {
  template: CustomTemplate;
  name: string;
  brand: string;
  model: string;
  dimsMm: { w: number; h: number; d: number };
  weightKg: number;
  specs: Record<string, string | number | boolean>;
  images: Partial<Record<ImageSlot, string>>;
  terminals: CustomPart["terminals"];
}

export function emptyDraft(template: CustomTemplate): Draft {
  const specs: Draft["specs"] = {};
  for (const f of SPEC_FIELDS[template]) specs[f.key] = f.default;
  return {
    template,
    name: "",
    brand: "",
    model: "",
    dimsMm: { ...DEFAULT_DIMS[template] },
    weightKg: 0.1,
    specs,
    images: {},
    terminals: [],
  };
}

/** Problems that stop saving (errors) and things worth a second look (warnings). */
export function checkDraft(d: Draft): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!d.name.trim()) errors.push("Give the part a name.");
  for (const k of ["w", "h", "d"] as const)
    if (!(d.dimsMm[k] > 0))
      errors.push(`The ${{ w: "width", h: "height", d: "depth" }[k]} must be more than 0 mm.`);
  for (const f of SPEC_FIELDS[d.template])
    if (f.kind === "number") {
      const v = Number(d.specs[f.key]);
      if (!Number.isFinite(v) || v <= 0) errors.push(`${f.label} must be a number more than 0.`);
    }
  if (d.template === "din-breaker") {
    const modules = Number(d.specs.modules);
    if (Math.abs(d.dimsMm.w - modules * 18) > 2)
      warnings.push(
        `Width ${d.dimsMm.w} mm does not match ${modules} module(s) × 18 mm = ${modules * 18} mm. It snaps onto the rail by modules.`,
      );
    if (!Number.isInteger(modules)) errors.push("Modules must be a whole number.");
  }
  if (d.template === "din-enclosure") {
    for (const k of ["modulesPerRow", "rows"])
      if (!Number.isInteger(Number(d.specs[k])))
        errors.push("Modules per row and rows must be whole numbers.");
  }
  if (!d.images.front) warnings.push("No front photo: the 3D model is a plain box.");
  else if (!d.images.left && !d.images.right && !d.images.back)
    warnings.push("Only one photo: the 3D body is a guess (marked approximate).");
  return { errors, warnings };
}

export function draftToPart(d: Draft, taken: ReadonlySet<string>, now = new Date()): CustomPart {
  const { errors } = checkDraft(d);
  if (errors.length) throw new PackageError(errors.join(" "));
  const extra = (["left", "right", "back", "top"] as const).some((s) => d.images[s]);
  return {
    id: newPartId(d.name, taken),
    template: d.template,
    name: d.name.trim(),
    brand: d.brand.trim(),
    model: d.model.trim(),
    dimsMm: d.dimsMm,
    weightKg: d.weightKg,
    specs: d.specs,
    images: d.images,
    terminals: d.terminals,
    approximate: !extra,
    source: "user-upload",
    verified: "user",
    createdAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------- files

function dataUrlToBytes(url: string): { bytes: Uint8Array; ext: string } {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!m) throw new PackageError("A photo is not a data URL.");
  const mime = m[1]!;
  const bin = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  return { bytes, ext };
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${MIME[ext.toLowerCase()] ?? "image/png"};base64,${btoa(bin)}`;
}

/** The files of one part: `<id>/part.json` and its photos. */
export function partToFiles(p: CustomPart): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const images: Record<string, string> = {};
  for (const slot of IMAGE_SLOTS) {
    const url = p.images[slot];
    if (!url) continue;
    const { bytes, ext } = dataUrlToBytes(url);
    images[slot] = `${slot}.${ext}`;
    files[`${p.id}/${slot}.${ext}`] = bytes;
  }
  const json = {
    format: PART_FORMAT,
    id: p.id,
    template: p.template,
    name: p.name,
    brand: p.brand,
    model: p.model,
    dimsMm: p.dimsMm,
    weightKg: p.weightKg,
    specs: p.specs,
    terminals: p.terminals,
    approximate: p.approximate,
    createdAt: p.createdAt,
    images,
  };
  files[`${p.id}/part.json`] = strToU8(JSON.stringify(json, null, 2));
  return files;
}

/** Build a part from `part.json` text and a way to read its photo files. */
export function partFromJson(
  text: string,
  readImage: (file: string) => Uint8Array | string | undefined,
): CustomPart {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PackageError("part.json is not valid JSON.");
  }
  const r = PartJsonSchema.safeParse(raw);
  if (!r.success)
    throw new PackageError(
      `part.json: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    );
  const j = r.data;
  const images: CustomPart["images"] = {};
  for (const [slot, file] of Object.entries(j.images) as [ImageSlot, string][]) {
    const data = readImage(file);
    if (data === undefined) continue; // a missing photo is not fatal: the part just has no picture there
    images[slot] =
      typeof data === "string" ? data : bytesToDataUrl(data, file.split(".").pop() ?? "png");
  }
  return {
    id: j.id,
    template: j.template,
    name: j.name,
    brand: j.brand,
    model: j.model,
    dimsMm: j.dimsMm,
    weightKg: j.weightKg,
    specs: j.specs,
    images,
    terminals: j.terminals,
    approximate: j.approximate,
    source: "user-upload",
    verified: "user",
    createdAt: j.createdAt,
  };
}

/** A `.partpack` (zip) with the given parts. */
export function exportPartPack(parts: readonly CustomPart[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const p of parts) Object.assign(files, partToFiles(p));
  return zipSync(files, { level: 6 });
}

/** Parts in a `.partpack`; bad parts are reported, good ones still load. */
export function importPartPack(bytes: Uint8Array): { parts: CustomPart[]; problems: string[] } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new PackageError("This is not a part pack (could not open the zip).");
  }
  const parts: CustomPart[] = [];
  const problems: string[] = [];
  for (const path of Object.keys(files)) {
    if (!path.endsWith("/part.json") && path !== "part.json") continue;
    const dir = path.slice(0, path.length - "part.json".length);
    try {
      parts.push(partFromJson(strFromU8(files[path]!), (f) => files[`${dir}${f}`]));
    } catch (e) {
      problems.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (parts.length === 0 && problems.length === 0) problems.push("The pack contains no part.json.");
  return { parts, problems };
}

// ---------------------------------------------------------------- embedded in saved files

/** The shape stored inside `.solarbench.json` and in the autosave: photos are data URLs. */
export const EmbeddedPartSchema = PartMeta.extend({
  images: z.partialRecord(z.enum(IMAGE_SLOTS), z.string()).default({}),
  source: z.literal("user-upload").default("user-upload"),
  verified: z.literal("user").default("user"),
});

/** Parts from a saved file; a part that does not validate is skipped and reported. */
export function customPartsFromFile(list: readonly unknown[]): {
  parts: CustomPart[];
  problems: string[];
} {
  const parts: CustomPart[] = [];
  const problems: string[] = [];
  for (const raw of list) {
    const r = EmbeddedPartSchema.safeParse(raw);
    if (!r.success) {
      const id =
        typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : "?";
      problems.push(
        `Custom part ${id} was not loaded: ${r.error.issues[0]?.message ?? "invalid"}.`,
      );
      continue;
    }
    const j = r.data;
    parts.push({
      id: j.id,
      template: j.template,
      name: j.name,
      brand: j.brand,
      model: j.model,
      dimsMm: j.dimsMm,
      weightKg: j.weightKg,
      specs: j.specs,
      images: j.images,
      terminals: j.terminals,
      approximate: j.approximate,
      source: "user-upload",
      verified: "user",
      createdAt: j.createdAt,
    });
  }
  return { parts, problems };
}
