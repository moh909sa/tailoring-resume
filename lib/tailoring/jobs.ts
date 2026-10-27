import { isRecord } from "@/lib/cv/types";
import { pollTailoringProgress } from "@/lib/tailoring/progress";
import type {
  TailoringInput,
  TailoringJob,
  TailoringPreview,
  TailoringProgress,
} from "@/lib/tailoring/types";

export type SavedTailoringJob = {
  progressId: string;
  input: TailoringInput | null;
  startedAt: number;
  status: TailoringProgress["status"] | "unknown";
  delivered: boolean;
  previousJobId: string | null;
};
export type DurableJobState = {
  job: SavedTailoringJob | null;
  progress: TailoringProgress | null;
  recovering: boolean;
  submitting: boolean;
  connectionError: string | null;
  terminalError: string | null;
};
type JobDependencies = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<unknown>;
  uuid: () => string;
  submit: (input: TailoringInput, id: string, signal: AbortSignal) => Promise<TailoringJob>;
  recent: (signal: AbortSignal) => Promise<TailoringJob[]>;
  progress: (id: string, signal: AbortSignal) => Promise<TailoringProgress>;
  result: (id: string, signal: AbortSignal) => Promise<TailoringPreview>;
  onState: (state: DurableJobState) => void;
  onResult: (preview: TailoringPreview, job: SavedTailoringJob) => Promise<void>;
};
export const jobStorageKey = (ownerId: string) => "tailoring-job-v1:" + ownerId;
const isPending = (status: SavedTailoringJob["status"]) =>
  status === "queued" || status === "running";
const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function readSavedJob(raw: string | null): SavedTailoringJob | null {
  const value: unknown = raw ? JSON.parse(raw) : null;
  if (
    !isRecord(value) ||
    !validId(value.progressId) ||
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt) ||
    !["unknown", "queued", "running", "succeeded", "failed", "interrupted"].includes(
      String(value.status),
    )
  )
    return null;
  const input =
    isRecord(value.input) &&
    typeof value.input.resumeId === "string" &&
    typeof value.input.filename === "string" &&
    typeof value.input.jobDescription === "string"
      ? {
          resumeId: value.input.resumeId,
          filename: value.input.filename,
          jobDescription: value.input.jobDescription,
        }
      : null;
  return {
    progressId: value.progressId,
    input,
    startedAt: value.startedAt,
    status: value.status as SavedTailoringJob["status"],
    delivered: value.delivered === true,
    previousJobId: validId(value.previousJobId) ? value.previousJobId : null,
  };
}

// A durable job is owned by the server. Controllers below cancel only transport
// and reads; recovery never submits AI work. Dependencies keep lifecycle tests deterministic.
export class DurableTailoringJob {
  private state: DurableJobState = {
    job: null,
    progress: null,
    recovering: false,
    submitting: false,
    connectionError: null,
    terminalError: null,
  };
  private active = true;
  private disposed = false;
  private initialized = false;
  private checkedRecent = false;
  private latestJobId: string | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private reading: AbortController | null = null;
  private posting: AbortController | null = null;
  private stopPolling: (() => void) | null = null;
  private retrieving = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly deps: JobDependencies) {}
  get snapshot(): DurableJobState {
    return this.state;
  }
  get busy(): boolean {
    const job = this.state.job;
    return (
      this.state.submitting ||
      this.state.recovering ||
      this.retrieving ||
      !!(
        job &&
        !job.delivered &&
        (isPending(job.status) || job.status === "unknown" || job.status === "succeeded")
      )
    );
  }
  private change(patch: Partial<DurableJobState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.deps.onState(this.state);
  }
  private async persist() {
    const value = JSON.stringify(this.state.job);
    const write = this.writes.catch(() => undefined).then(() => this.deps.write(value));
    this.writes = write;
    await write;
  }
  private stopReads() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPolling?.();
    this.stopPolling = null;
    this.reading?.abort();
    this.reading = null;
  }
  async restore(): Promise<void> {
    try {
      this.change({ recovering: true });
      const job = readSavedJob(await this.deps.read());
      if (this.disposed) return;
      this.change({ job });
    } catch {
      // Recent server jobs can still recover a lost/unavailable device cache.
    } finally {
      this.initialized = true;
      this.change({ recovering: false });
    }
    if (!this.disposed && this.active) await this.recover();
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.stopReads();
    else if (this.initialized) void this.recover();
  }
  start(input: TailoringInput): boolean {
    if (this.disposed || !this.initialized || this.busy) return false;
    if (!this.checkedRecent) {
      void this.recover();
      return false;
    }
    this.stopReads();
    try {
      this.change({
        job: {
          progressId: this.deps.uuid(),
          input,
          startedAt: Date.now(),
          status: "unknown",
          delivered: false,
          previousJobId: this.latestJobId,
        },
        progress: null,
        connectionError: null,
        terminalError: null,
        submitting: true,
      });
      void this.submitSaved();
    } catch {
      this.change({
        terminalError: "We couldn’t securely start tailoring. Please try again.",
        submitting: false,
      });
    }
    return true;
  }
  // Only an explicit user action can resend the SAME idempotent job. Failed or
  // interrupted jobs may start a fresh job only through an explicit Retry tap.
  retry() {
    const job = this.state.job;
    if (this.disposed || this.state.submitting || this.state.recovering || this.retrieving) return;
    if (job?.status === "unknown" && job.input) {
      this.change({ submitting: true });
      void this.submitSaved();
    } else if (job && (job.status === "failed" || job.status === "interrupted") && job.input)
      this.start(job.input);
    else void this.recover();
  }
  private async submitSaved() {
    const job = this.state.job;
    if (!job?.input) {
      this.change({ submitting: false });
      return;
    }
    const controller = new AbortController();
    this.posting = controller;
    let persisted = false;
    try {
      // Strict write-before-submit. A storage error never starts paid work.
      await this.persist();
      persisted = true;
      if (this.disposed) return;
      const accepted = await this.deps.submit(job.input, job.progressId, controller.signal);
      if (this.disposed) return;
      await this.adopt(accepted, job.input);
    } catch {
      if (!this.disposed)
        this.change({
          connectionError: persisted
            ? "We couldn’t confirm the job submission. Your job reference is saved. Check its status before trying again."
            : "We couldn’t save the job on your device. Nothing was submitted. Retry when device storage is available.",
        });
    } finally {
      if (this.posting === controller) this.posting = null;
      this.change({ submitting: false });
      // This is GET-only reconciliation, including a lost HTTP 202 response.
      if (!this.disposed && this.active) void this.recover();
    }
  }
  async recover(): Promise<void> {
    if (
      this.disposed ||
      !this.active ||
      !this.initialized ||
      this.state.submitting ||
      this.state.recovering ||
      this.retrieving
    )
      return;
    this.stopReads();
    const controller = new AbortController();
    this.reading = controller;
    this.change({ recovering: true });
    try {
      const saved = this.state.job;
      const [recent, known] = await Promise.allSettled([
        this.deps.recent(controller.signal),
        saved && !saved.delivered
          ? this.deps.progress(saved.progressId, controller.signal)
          : Promise.resolve(null),
      ]);
      if (this.disposed || controller.signal.aborted || !this.active) return;
      let job: TailoringJob | null = null;
      if (recent.status === "fulfilled") {
        this.checkedRecent = true;
        this.latestJobId = recent.value[0]?.progress_id ?? null;
      }
      if (known.status === "fulfilled" && known.value && saved)
        job = { ...known.value, progress_id: known.value.progress_id ?? saved.progressId };
      else if (recent.status === "fulfilled") {
        const rows = recent.value;
        job =
          (saved && !saved.delivered
            ? rows.find((row) => row.progress_id === saved.progressId)
            : undefined) ??
          rows.find(
            (row) =>
              isPending(row.status) && (!saved?.delivered || row.progress_id !== saved.progressId),
          ) ??
          (saved?.delivered
            ? rows.find(
                (row) =>
                  row.progress_id !== saved.progressId &&
                  !!row.started_at &&
                  Date.parse(row.started_at) > saved.startedAt,
              )
            : !saved || (saved.status === "unknown" && rows[0]?.progress_id !== saved.previousJobId)
              ? rows[0]
              : undefined) ??
          null;
      }
      if (job)
        await this.adopt(
          job,
          saved?.progressId === job.progress_id || saved?.status === "unknown"
            ? (saved?.input ?? null)
            : null,
        );
      else if (saved && !saved.delivered)
        this.change({
          connectionError:
            "We couldn’t find this job yet. Check status again, or use Retry same job to safely resend its saved reference.",
        });
      else if (recent.status === "rejected")
        this.change({
          connectionError:
            "We couldn’t check your previous jobs. Check your connection and try again.",
        });
      else this.change({ connectionError: null });
    } catch {
      if (!controller.signal.aborted && !this.disposed)
        this.change({
          connectionError: "We couldn’t reload your job. Your saved job and inputs are preserved.",
        });
    } finally {
      if (this.reading === controller) this.reading = null;
      if (!this.disposed) this.change({ recovering: false });
      this.poll();
      if (!this.disposed && this.active && controller.signal.aborted) void this.recover();
      else this.scheduleRecovery();
    }
  }
  private scheduleRecovery(force = false) {
    if (
      this.disposed ||
      !this.active ||
      (!force && !this.state.connectionError) ||
      this.retryTimer !== null
    )
      return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.recover();
    }, 5000);
  }
  private async adopt(progress: TailoringJob, input: TailoringInput | null) {
    const old = this.state.job;
    const start = progress.started_at ? Date.parse(progress.started_at) : NaN;
    const job: SavedTailoringJob = {
      progressId: progress.progress_id,
      status: progress.status,
      startedAt: Number.isFinite(start) ? start : (old?.startedAt ?? Date.now()),
      input,
      delivered: (old?.progressId === progress.progress_id && old.delivered) || false,
      previousJobId: old?.previousJobId ?? this.latestJobId,
    };
    this.change({
      job,
      progress,
      connectionError: null,
      terminalError:
        progress.status === "interrupted"
          ? "Tailoring was interrupted on the server. Your original CV and inputs are unchanged. You can retry when you’re ready."
          : progress.status === "failed"
            ? "This tailoring job couldn’t finish. Your original CV and inputs are unchanged."
            : null,
    });
    // Save canonical IDs returned by the backend, not just provisional IDs.
    await this.persist();
    if (!this.disposed && this.active && progress.status === "succeeded" && !job.delivered)
      await this.result();
  }
  private poll() {
    const job = this.state.job;
    if (
      this.disposed ||
      !this.active ||
      this.state.submitting ||
      this.state.recovering ||
      this.retrieving ||
      !job ||
      job.delivered ||
      !isPending(job.status) ||
      this.stopPolling
    )
      return;
    const lifetime = new AbortController();
    const stop = pollTailoringProgress(
      async (signal) => {
        try {
          return await this.deps.progress(job.progressId, signal);
        } catch (error) {
          if (!signal.aborted)
            this.change({
              connectionError: "Reconnecting to your job. Processing continues on the server.",
            });
          throw error;
        }
      },
      (progress) => {
        if (this.disposed || !this.active || this.state.job?.progressId !== job.progressId) return;
        if (!isPending(progress.status)) {
          this.stopPolling = null;
        }
        void this.adopt(
          { ...progress, progress_id: progress.progress_id ?? job.progressId },
          this.state.job.input,
        ).catch(() => {
          this.change({
            connectionError: "Your job is preserved. Check status to reload its latest result.",
          });
        });
      },
      lifetime.signal,
    );
    this.stopPolling = () => {
      stop();
      lifetime.abort();
    };
  }
  private async result() {
    const job = this.state.job;
    if (!job || this.retrieving || this.disposed || !this.active) return;
    this.retrieving = true;
    const controller = new AbortController();
    this.reading = controller;
    try {
      const preview = await this.deps.result(job.progressId, controller.signal);
      if (controller.signal.aborted || this.disposed || !this.active) return;
      // The review pointer is persisted by onResult before marking delivery.
      await this.deps.onResult(preview, job);
      if (this.disposed) return;
      this.change({ job: { ...job, delivered: true }, connectionError: null });
      await this.persist();
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) {
        const message = error instanceof Error ? error.message : "";
        if (/already saved or unavailable/i.test(message)) {
          this.change({
            job: { ...job, delivered: true },
            terminalError:
              "This preview has already been saved or is no longer available. Return to Tailor CV to continue.",
          });
          await this.persist();
        } else
          this.change({
            connectionError:
              "Your job has finished. We couldn’t download its preview yet. Check status to retrieve it without running AI again.",
          });
      }
    } finally {
      this.retrieving = false;
      if (this.reading === controller) this.reading = null;
      if (!this.disposed && this.active && controller.signal.aborted) this.scheduleRecovery(true);
      else this.scheduleRecovery();
    }
  }
  dispose() {
    this.disposed = true;
    this.stopReads();
    this.posting?.abort();
  }
}
