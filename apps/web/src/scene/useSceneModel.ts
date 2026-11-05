import { computeScene, type SceneModel } from "../model/sceneModel";
import type { ProjectFile } from "../project/projectFile";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

/**
 * The derived scene (layouts, wiring, protection, grounding, issues, BOM).
 * Many components read it, so one shared cache keyed on the project object
 * (immutable: a new object on every edit) and the ATS outage scenario keeps it
 * to one computation per change.
 */
let cache: { project: ProjectFile; outages: string; scene: SceneModel } | undefined;

export function sceneFor(project: ProjectFile, outages: readonly string[]): SceneModel {
  const key = [...outages].sort().join("|");
  if (cache && cache.project === project && cache.outages === key) return cache.scene;
  const scene = computeScene(project, new Set(outages));
  cache = { project, outages: key, scene };
  return scene;
}

export function useSceneModel(): SceneModel {
  const project = useProject((s) => s.project);
  const outages = useUi((s) => s.outages);
  return sceneFor(project, outages);
}
