import { useMemo } from "react";
import { computeScene, type SceneModel } from "../model/sceneModel";
import { useProject } from "../state/projectStore";

/** The derived scene (layouts, issues, BOM), recomputed only when the project changes. */
export function useSceneModel(): SceneModel {
  const project = useProject((s) => s.project);
  return useMemo(() => computeScene(project), [project]);
}
