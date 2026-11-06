import { partFromJson } from "../model/customPackage";
import type { CustomPart } from "./customParts";

/**
 * DROP-IN PARTS — product folders placed in `assets/user-parts/<part-id>/`
 * (a `part.json` and its photos) are loaded when the app starts, with no
 * wizard. Folders starting with an underscore are templates and are skipped.
 * See assets/user-parts/README.md for the format.
 */
const jsons = import.meta.glob("../../../../../assets/user-parts/*/part.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const photos = import.meta.glob("../../../../../assets/user-parts/*/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?inline",
  import: "default",
}) as Record<string, string>;

export function loadDropInParts(
  jsonFiles: Record<string, string> = jsons,
  photoFiles: Record<string, string> = photos,
): { parts: CustomPart[]; problems: string[] } {
  const parts: CustomPart[] = [];
  const problems: string[] = [];
  for (const [path, text] of Object.entries(jsonFiles)) {
    const dir = path.slice(0, path.length - "part.json".length);
    const folder = dir.split("/").filter(Boolean).pop() ?? "";
    if (folder.startsWith("_")) continue;
    try {
      parts.push(partFromJson(text, (file) => photoFiles[`${dir}${file}`]));
    } catch (e) {
      problems.push(`assets/user-parts/${folder}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { parts, problems };
}
