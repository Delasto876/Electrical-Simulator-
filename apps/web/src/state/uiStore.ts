import { create } from "zustand";

export type Theme = "light" | "dark";
export type BottomTab = "issues" | "calculations" | "charts" | "bom" | "timeline";

interface UiState {
  theme: Theme;
  bottomTab: BottomTab;
  /** Catalog part currently shown in the inspector (palette selection in Phase 0). */
  selectedCatalogId: string | null;
  setTheme: (t: Theme) => void;
  setBottomTab: (t: BottomTab) => void;
  selectCatalogPart: (id: string | null) => void;
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("solar-sim:theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable: fall through to system preference */
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const useUi = create<UiState>((set) => ({
  theme: initialTheme(),
  bottomTab: "issues",
  selectedCatalogId: null,
  setTheme: (theme) => {
    try {
      localStorage.setItem("solar-sim:theme", theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  setBottomTab: (bottomTab) => set({ bottomTab }),
  selectCatalogPart: (selectedCatalogId) => set({ selectedCatalogId }),
}));
