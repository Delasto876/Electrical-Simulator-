import { simulate, type SimInput } from "@solar-sim/engine";

/** Runs the time-series simulation off the UI thread. */
self.onmessage = (e: MessageEvent<SimInput>) => {
  try {
    const out = simulate(e.data);
    const buffers = [
      out.times.buffer,
      ...Object.values(out.channels).map((a) => a.buffer),
      ...Object.values(out.stringCurrents).map((a) => a.buffer),
    ];
    (self as unknown as Worker).postMessage({ ok: true, out }, buffers);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
