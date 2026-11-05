import { z } from "zod";
import { Part } from "./schema/part";

export interface CatalogIssue {
  /** Index of the entry in the input array. */
  index: number;
  /** Part id if it could be read, otherwise undefined. */
  id: string | undefined;
  message: string;
}

export interface CatalogLoadResult {
  parts: Part[];
  issues: CatalogIssue[];
}

/**
 * Validate an array of raw catalog entries. Invalid entries are skipped and
 * reported rather than throwing, so one bad row in a user's CSV/JSON import
 * does not drop the whole catalog. Duplicate ids are reported; the first wins.
 */
export function loadCatalog(raw: unknown): CatalogLoadResult {
  const issues: CatalogIssue[] = [];
  if (!Array.isArray(raw)) {
    return {
      parts: [],
      issues: [{ index: -1, id: undefined, message: "catalog must be an array" }],
    };
  }
  const parts: Part[] = [];
  const seen = new Set<string>();
  raw.forEach((entry: unknown, index) => {
    const id = readId(entry);
    const result = Part.safeParse(entry);
    if (!result.success) {
      issues.push({ index, id, message: z.prettifyError(result.error) });
      return;
    }
    if (seen.has(result.data.id)) {
      issues.push({ index, id, message: `duplicate id "${result.data.id}" (first entry kept)` });
      return;
    }
    seen.add(result.data.id);
    parts.push(result.data);
  });
  return { parts, issues };
}

function readId(entry: unknown): string | undefined {
  if (entry && typeof entry === "object" && "id" in entry && typeof entry.id === "string") {
    return entry.id;
  }
  return undefined;
}

/** Serialise parts back to plain JSON (for catalog export). */
export function exportCatalog(parts: readonly Part[]): string {
  return JSON.stringify(parts, null, 2);
}
