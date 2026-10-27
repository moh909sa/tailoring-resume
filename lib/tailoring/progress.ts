import type { TailoringProgress } from "@/lib/tailoring/types";

export const PROGRESS_POLL_INTERVAL_MS = 1750;

// Progress reads never own the durable worker. Missing/unavailable records retry
// independently, with only one GET at a time.
export function pollTailoringProgress(
  load: (signal: AbortSignal) => Promise<TailoringProgress>,
  onProgress: (progress: TailoringProgress) => void,
  signal: AbortSignal,
): () => void {
  const controller = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    signal.removeEventListener("abort", stop);
  }
  async function poll() {
    const started = Date.now();
    try {
      const progress = await load(controller.signal);
      if (stopped) return;
      onProgress(progress);
      if (progress.status !== "running" && progress.status !== "queued") stop();
    } catch {
      // Includes the brief registration 404 and transient network/auth errors.
      // Recovery and saved-result retrieval have their own error handling.
    } finally {
      if (!stopped)
        timer = setTimeout(
          () => void poll(),
          Math.max(0, PROGRESS_POLL_INTERVAL_MS - (Date.now() - started)),
        );
    }
  }
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  else void poll();
  return stop;
}
