import type { ProjectFile } from "../project/projectFile";
import type { SceneModel } from "../model/sceneModel";
import { fileStem, type ReportDoc, type ReportHeader } from "./doc";
import { buildSld } from "./sld";

/** Single-line diagram on A3 landscape, with the circuit schedule behind it. */
export function sldReport(p: ProjectFile, s: SceneModel, header: ReportHeader): ReportDoc {
  const sld = buildSld(p, s);
  const name = new Map(sld.nodes.map((n) => [n.id, `${n.tag} ${n.title}`]));
  return {
    title: "Single-line diagram",
    fileStem: fileStem(p.meta.name, "single-line-diagram"),
    orientation: "landscape",
    paper: "a3",
    header,
    blocks: [
      { kind: "diagram", drawing: sld.drawing },
      { kind: "heading", text: "Circuit schedule" },
      {
        kind: "table",
        sheet: "Circuits",
        columns: [
          { label: "From", width: 30 },
          { label: "To", width: 30 },
          { label: "Type", width: 6 },
          { label: "Conductors", width: 30 },
          { label: "Raceway", width: 20 },
        ],
        rows: sld.edges.map((e) => {
          const ca = sld.nodes.find((n) => n.id === e.a)?.col ?? 0;
          const cb = sld.nodes.find((n) => n.id === e.b)?.col ?? 0;
          const [from, to] = ca <= cb ? [e.a, e.b] : [e.b, e.a];
          return [
            name.get(from) ?? from,
            name.get(to) ?? to,
            e.dc ? "DC" : "AC",
            e.label,
            e.raceway.replace(/^in /, "") || "free air",
          ];
        }),
      },
    ],
  };
}
