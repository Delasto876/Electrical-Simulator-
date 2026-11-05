import type { ProjectFile } from "../project/projectFile";

/**
 * Storage behind an interface so a backend can be added later without
 * touching the UI (brief §2). v1 ships local-first implementations only.
 * The IndexedDB implementation and autosave arrive in Phase 2 with the scene.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProjectStorage {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<ProjectFile | undefined>;
  save(project: ProjectFile): Promise<void>;
  remove(id: string): Promise<void>;
}

/** In-memory storage for tests and for browsers where IndexedDB is unavailable. */
export class MemoryProjectStorage implements ProjectStorage {
  private readonly projects = new Map<string, ProjectFile>();

  async list(): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .map((p) => ({ id: p.meta.id, name: p.meta.name, updatedAt: p.meta.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<ProjectFile | undefined> {
    const p = this.projects.get(id);
    return p ? structuredClone(p) : undefined;
  }

  async save(project: ProjectFile): Promise<void> {
    this.projects.set(project.meta.id, structuredClone(project));
  }

  async remove(id: string): Promise<void> {
    this.projects.delete(id);
  }
}
