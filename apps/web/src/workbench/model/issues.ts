import { sortIssues, type Issue } from "@solar-sim/engine";
import type { WbDoc } from "../state/wbDoc";
import { mechanicalIssues } from "./railKit";
import { wiringIssues } from "./wireKit";
import { circuitReport } from "./circuitKit";
import { attachmentIssues } from "./roofSwap";

/** Every issue in the document: mechanical (per surface), wiring and circuit (strings, MPPTs). */
export function allIssues(doc: WbDoc): Issue[] {
  return sortIssues([
    ...Object.keys(doc.surfaces).flatMap((id) => mechanicalIssues(doc, id)),
    ...wiringIssues(doc),
    ...circuitReport(doc).issues,
    ...attachmentIssues(doc),
  ]);
}
