/** The claude.ai page host (present only when the app runs as a published artifact). */
interface DownloadsHost {
  save: (r: { filename: string; data: Blob }) => Promise<unknown>;
}
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

/**
 * Save a generated file. A published claude.ai page cannot start downloads
 * itself; there the host's `downloads` capability asks the viewer to confirm
 * the save. Everywhere else a temporary link is clicked.
 */
export async function saveFile(data: Uint8Array | string, name: string, mime: string) {
  const blob = new Blob([typeof data === "string" ? data : (data.slice().buffer as ArrayBuffer)], {
    type: mime,
  });
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  if (typeof host?.use === "function") {
    const dl = (await host.use("downloads")) as DownloadsHost | null;
    if (dl) {
      try {
        await dl.save({ filename: name, data: blob });
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        throw new Error(code === "declined" ? "save cancelled" : (code ?? String(e)), { cause: e });
      }
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
