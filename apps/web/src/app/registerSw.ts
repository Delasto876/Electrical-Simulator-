/**
 * Register the offline service worker (written by vite.config.ts at build
 * time). Only in production builds served over HTTPS / localhost, and not in
 * the claude.ai preview page (VITE_MODELS_AS_TEXT), whose host does not run
 * service workers.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || import.meta.env.VITE_MODELS_AS_TEXT === "1") return;
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  )
    return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((e: unknown) => console.warn("offline mode unavailable:", e));
  });
}
