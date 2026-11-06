import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "./app/registerSw";
import { Workbench } from "./workbench/Workbench";

/**
 * Entry. The Workbench is the app; the first-generation designer lives at
 * `#/classic` (its code and CSS are a lazy chunk, left out of the preview
 * build with VITE_NO_CLASSIC=1).
 */
const classicWanted = window.location.hash.startsWith("#/classic");
const noClassic = import.meta.env.VITE_NO_CLASSIC === "1";
const ClassicApp = noClassic ? null : lazy(() => import("./classic/ClassicApp"));

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");
createRoot(root).render(
  <StrictMode>
    {classicWanted && ClassicApp ? (
      <Suspense fallback={<p style={{ padding: 16 }}>Loading the classic designer…</p>}>
        <ClassicApp />
      </Suspense>
    ) : (
      <Workbench />
    )}
  </StrictMode>,
);

registerServiceWorker();
