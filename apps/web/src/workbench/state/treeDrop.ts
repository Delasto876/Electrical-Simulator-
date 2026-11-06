import type { WbDoc } from "./wbDoc";

/**
 * Where a dragged tree row lands. `zone` is where on the target row it was
 * dropped: the top part ("before"), the bottom part ("after") or, on a folder,
 * the middle ("into"). Returns the `node.move` arguments, or undefined if the
 * drop is not allowed (onto itself, into its own descendant, into a leaf).
 */
export function dropTarget(
  doc: WbDoc,
  dragId: string,
  overId: string,
  zone: "before" | "after" | "into",
): { parentId: string | null; index: number } | undefined {
  const drag = doc.nodes[dragId];
  const over = doc.nodes[overId];
  if (!drag || !over || dragId === overId) return undefined;
  for (let cur: string | null = overId; cur; cur = doc.nodes[cur]?.parentId ?? null)
    if (cur === dragId) return undefined; // into its own subtree
  const withoutDrag = (ids: readonly string[]) => ids.filter((x) => x !== dragId);
  if (zone === "into") {
    if (over.kind === "surface") return undefined;
    return { parentId: over.id, index: withoutDrag(over.children).length };
  }
  const siblings = withoutDrag(over.parentId ? doc.nodes[over.parentId]!.children : doc.rootIds);
  return { parentId: over.parentId, index: siblings.indexOf(over.id) + (zone === "after" ? 1 : 0) };
}
