import { useMemo } from "react";
import { computeScene, type SceneModel } from "../model/sceneModel";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

/** The derived scene (layouts, wiring, protection, grounding, issues, BOM), recomputed when the project or the ATS scenario changes. */
export function useSceneModel(): SceneModel {
  const project = useProject((s) => s.project);
  const outages = useUi((s) => s.outages);
  return useMemo(() => computeScene(project, new Set(outages)), [project, outages]);
}
