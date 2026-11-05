import { catalogById } from "../../app/catalog";
import { useUi } from "../../state/uiStore";
import { ArrayInspector } from "./ArrayInspector";
import { DerivedInspector } from "./DerivedInspector";
import { Nameplate } from "./Nameplate";
import { PartInspector } from "./PartInspector";
import { RoofInspector } from "./RoofInspector";
import { StringInspector } from "./StringInspector";
import { CableInspector } from "./CableInspector";

/** Right-hand panel: shows whatever is selected (scene object first, else a palette part). */
export function Inspector() {
  const selection = useUi((s) => s.selection);
  const catalogId = useUi((s) => s.selectedCatalogId);
  const catalogPart = catalogId ? catalogById.get(catalogId) : undefined;
  let body: React.ReactNode;
  if (selection?.kind === "roof") body = <RoofInspector />;
  else if (selection?.kind === "array") body = <ArrayInspector id={selection.id} />;
  else if (selection?.kind === "derived")
    body = (
      <DerivedInspector
        arrayId={selection.arrayId}
        partKey={selection.key}
        catalogId={selection.catalogId}
      />
    );
  else if (selection?.kind === "part") body = <PartInspector id={selection.id} />;
  else if (selection?.kind === "string") body = <StringInspector id={selection.id} />;
  else if (selection?.kind === "cable") body = <CableInspector id={selection.id} />;
  else if (catalogPart) body = <Nameplate part={catalogPart} />;
  else
    body = (
      <>
        <p className="empty">
          Click the roof to edit it, or place a PV module from the palette to start an array.
        </p>
        <RoofInspector />
      </>
    );
  return (
    <div className="panel">
      <h2 className="panel-title">Inspector</h2>
      {body}
    </div>
  );
}
