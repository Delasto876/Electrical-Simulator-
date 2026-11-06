import { useMemo } from "react";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { ISSUE_CODES, projectOnRail, type Issue } from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import {
  clampGrips,
  holdsOf,
  mechanicalIssues,
  railPose,
  railSpecOf,
  stockOf,
  supportsOf,
} from "../model/railKit";
import { joinCommand } from "../model/railTools";
import { startCut, startRail, startSplice } from "../state/railToolActions";
import { SURFACE_ID } from "../state/wbDoc";
import { useDoc, useWb } from "../state/wbStore";
import { showToast, useView } from "../state/wbView";
import { Row, Section } from "./Fields";

/** Rail, module, clamp and splice details for a selected placed part. */
export function RailKitSection({ partId }: { partId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const p = doc.parts[partId];
  const fmt = (m: number) => formatLength(m, unit, 0);
  if (!p) return null;
  if (p.rail) {
    const spec = railSpecOf(p.catalogId);
    const sup = supportsOf(doc, p);
    const stock = doc.stock.find((s) => s.id === p.rail!.stockId);
    return (
      <Section title="Rail">
        <Row label="Length">
          <span data-testid="rail-length-value">{fmt(p.rail.lengthM)}</span>
        </Row>
        <Row label="From stock">{stock ? fmt(stock.lengthM) : "—"}</Row>
        <Row label="Cut ends">
          {[p.rail.cutStart && "start", p.rail.cutEnd && "end"].filter(Boolean).join(", ") ||
            "none"}
        </Row>
        <Row label="On attachments">{sup.length}</Row>
        {sup.length > 0 && (
          <Row label="Overhangs">
            {fmt(sup[0]!.t)} / {fmt(p.rail.lengthM - sup[sup.length - 1]!.t)} (max{" "}
            {fmt(spec?.maxCantileverM ?? 0.6)})
          </Row>
        )}
        <Row label="Run">
          {p.rail.runId ? (doc.nodes[p.rail.runId]?.name ?? p.rail.runId) : "single rail"}
        </Row>
        <div className="wb-btnrow">
          <button
            type="button"
            className="wb-btn"
            onClick={() => startCut(p.id)}
            data-testid="rail-cut"
          >
            Cut…
          </button>
          <button type="button" className="wb-btn" onClick={() => startSplice()}>
            Splice…
          </button>
        </div>
      </Section>
    );
  }
  if (p.module) {
    const h = holdsOf(doc, p.surfaceId).find((x) => x.moduleId === p.id);
    return (
      <Section title="Module on rails">
        <Row label="Orientation">{p.module.orientation}</Row>
        <Row label="Rails in zone">{h?.railsInZone.length ?? 0} (needs 2)</Row>
        <Row label="Clamps">
          <span data-testid="module-clamps">{h?.clamps.length ?? 0}</span> (needs 4)
        </Row>
        <button
          type="button"
          className="wb-btn"
          onClick={() => {
            const cmd = joinCommand(doc, p.surfaceId, [p.id]);
            if ("error" in cmd) showToast(cmd.error, "warn");
            else useWb.getState().dispatch(cmd);
          }}
        >
          Clamp this module
        </button>
      </Section>
    );
  }
  if (p.clamp) {
    const rail = doc.parts[p.clamp.railId];
    const grips = clampGrips(doc, p);
    return (
      <Section title="Clamp">
        <Row label="Kind">{p.clamp.kind === "mid" ? "Mid clamp" : "End clamp"}</Row>
        <Row label="On rail">
          {Object.values(doc.nodes).find((n) => n.partId === rail?.id)?.name ?? "—"}, at{" "}
          {fmt(p.clamp.t)}
        </Row>
        <Row label="Grips">
          {grips.length === 0
            ? "no module"
            : `${grips.length} module(s), ${grips.every((g) => g.inZone) ? "in zone" : "OUTSIDE the clamping zone"}`}
        </Row>
      </Section>
    );
  }
  if (p.splice) {
    const a = doc.parts[p.splice.railA];
    const name = (id: string) => Object.values(doc.nodes).find((n) => n.partId === id)?.name ?? id;
    const at = a?.rail ? projectOnRail(railPose(a), [p.x, p.z]).t : 0;
    return (
      <Section title="Splice">
        <Row label="Joins">
          {name(p.splice.railA)} + {name(p.splice.railB)}
        </Row>
        <Row label="Bonded">{p.splice.bonded ? "yes" : "no"}</Row>
        <Row label="Along rail A">{fmt(at)}</Row>
      </Section>
    );
  }
  return null;
}

const SEV_ICON = { error: OctagonAlert, warning: AlertTriangle, info: Info } as const;

/** Issues tab: every mechanical rule broken on the surface; click one to select the part. */
export function IssuesList() {
  const doc = useDoc();
  const issues: Issue[] = useMemo(() => mechanicalIssues(doc, SURFACE_ID), [doc]);
  if (issues.length === 0)
    return (
      <div className="wb-tabbody" data-testid="issues-empty">
        <p>No issues.</p>
        <p className="wb-hint">
          Mechanical rules check rails (attachments, spans, overhangs), splices, modules (two rails
          in the clamping zone, four clamps) and clamps as you build.
        </p>
      </div>
    );
  const select = (i: Issue) => {
    const id = i.partIds.find((x) => Object.values(doc.nodes).some((n) => n.partId === x));
    const node = id ? Object.values(doc.nodes).find((n) => n.partId === id) : undefined;
    if (node) useView.getState().set({ selection: node.id, libraryPart: null });
  };
  return (
    <ul className="wb-issues" data-testid="issues" aria-label="Issues">
      {issues.map((i, k) => {
        const Icon = SEV_ICON[i.severity];
        return (
          <li key={k}>
            <button
              type="button"
              className={`wb-issue is-${i.severity}`}
              onClick={() => select(i)}
              data-testid="issue"
            >
              <Icon size={14} aria-hidden />
              <span className="wb-issue-title">{ISSUE_CODES[i.code].title}</span>
              <span className="wb-issue-msg">{i.message}</span>
              <span className="wb-issue-fix">{i.fixHint}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Offcut pool in the Parts Library: reuse a piece as a rail, or throw it away. */
export function OffcutPool() {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const st = stockOf(doc);
  if (doc.offcuts.length === 0 && doc.stock.length === 0) return null;
  return (
    <section className="wb-libgroup" data-testid="offcuts">
      <div className="wb-libgroup-head wb-myparts-head">
        <span>Offcuts</span>
        <span className="wb-count">{doc.offcuts.length}</span>
      </div>
      <p className="wb-hint wb-pad">
        Stock rails {st.stockCount}, waste {st.wastePct.toFixed(1)} %.
      </p>
      <ul className="wb-cards">
        {doc.offcuts.map((o) => (
          <li key={o.id} className="wb-offcut">
            <span>
              {railSpecOf(o.catalogId)?.profile ?? "rail"} {formatLength(o.lengthM, unit, 0)}
            </span>
            <button
              type="button"
              className="wb-btn"
              data-testid={`use-offcut-${o.id}`}
              onClick={() => startRail(o.catalogId, o.id)}
            >
              Use offcut
            </button>
            <button
              type="button"
              className="wb-mini"
              aria-label="Discard offcut"
              onClick={() => useWb.getState().dispatch({ type: "offcut.discard", id: o.id })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
