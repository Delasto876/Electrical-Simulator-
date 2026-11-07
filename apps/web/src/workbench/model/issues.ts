import { sortIssues, type Issue } from "@solar-sim/engine";
import type { WbDoc } from "../state/wbDoc";
import { mechanicalIssues } from "./railKit";
import { wiringIssues } from "./wireKit";

/** Every issue in the document: mechanical (per surface) and wiring. */
export function allIssues(doc: WbDoc): Issue[] {
  return sortIssues([
    ...Object.keys(doc.surfaces).flatMap((id) => mechanicalIssues(doc, id)),
    ...wiringIssues(doc),
  ]);
}
