import { randomUUID } from "expo-crypto";
import { AppState } from "react-native";
import { DurableTailoringJob, jobStorageKey, type SavedTailoringJob } from "@/lib/tailoring/jobs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  applyTailoringKeywords,
  confirmTailoring,
  CvApiError,
  loadTailoringReview,
  getTailoringProgress,
  startTailoringJob,
  recentTailoringJobs,
  tailoringJobResult,
} from "@/lib/cv/api";
import { isRecord } from "@/lib/cv/types";
import {
  keywordKey,
  previewHasExpired,
  type KeywordSelection,
  type ReviewStep,
  type TailoringConfirmation,
  type TailoringInput,
  type TailoringPreview,
  type TailoringProgress,
} from "@/lib/tailoring/types";

type ReviewProblem = {
  kind: "retry" | "conflict" | "expired" | "validation" | "unavailable" | "auth";
  message: string;
};
type ReviewActivity = "load" | "keywords" | "confirm" | null;
type RunState = {
  ownerId: string | null;
  status: "idle" | "running" | "success" | "error";
  input: TailoringInput | null;
  tailoringId: string | null;
  lastPreviewId: string | null;
  preview: TailoringPreview | null;
  progressId: string | null;
  progress: TailoringProgress | null;
  jobStatus: SavedTailoringJob["status"] | null;
  jobRecovering: boolean;
  jobConnectionError: string | null;
  pendingJobReview: boolean;
  pendingJobProcessing: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  hydrating: boolean;
  step: ReviewStep;
  selectedKeywords: KeywordSelection[];
  reviewActivity: ReviewActivity;
  reviewProblem: ReviewProblem | null;
  needsReload: boolean;
  saved: boolean;
  confirmation: TailoringConfirmation | null;
};
const emptyRun: RunState = {
  ownerId: null,
  status: "idle",
  input: null,
  tailoringId: null,
  lastPreviewId: null,
  preview: null,
  progressId: null,
  progress: null,
  jobStatus: null,
  jobRecovering: false,
  jobConnectionError: null,
  pendingJobReview: false,
  pendingJobProcessing: false,
  startedAt: null,
  finishedAt: null,
  error: null,
  hydrating: false,
  step: 0,
  selectedKeywords: [],
  reviewActivity: null,
  reviewProblem: null,
  needsReload: false,
  saved: false,
  confirmation: null,
};
type TailoringContextValue = RunState & {
  start: (input: TailoringInput) => boolean;
  recoverJob: () => void;
  acknowledgeJobNavigation: () => void;
  retry: () => void;
  reloadReview: (tailoringId?: string) => Promise<void>;
  applyKeywords: () => void;
  confirm: () => void;
  setStep: (step: ReviewStep) => void;
  toggleKeyword: (keyword: string, attested: boolean) => void;
};
const TailoringContext = createContext<TailoringContextValue | null>(null);
const storageKey = (ownerId: string) => "tailoring-review-v1:" + ownerId;

function problemFor(error: unknown): ReviewProblem {
  const message =
    error instanceof Error ? error.message : "The review could not be updated. Please try again.";
  const status = error instanceof CvApiError ? error.status : 0;
  const kind =
    status === 410 || /preview expired|preview has expired/i.test(message)
      ? "expired"
      : status === 401 || status === 403
        ? "auth"
        : status === 404
          ? "unavailable"
          : status === 422
            ? "validation"
            : status === 409
              ? "conflict"
              : "retry";
  return { kind, message };
}
function remainingSelections(
  selected: KeywordSelection[],
  preview: TailoringPreview,
): KeywordSelection[] {
  const options = preview.review.keyword_options;
  const applied = new Set(options.applied.map(keywordKey));
  const supported = new Set(options.supported.map(keywordKey));
  const needsAttestation = new Set(options.needs_attestation.map(keywordKey));
  return selected.filter(
    (item) =>
      !applied.has(keywordKey(item.keyword)) &&
      (supported.has(keywordKey(item.keyword)) || needsAttestation.has(keywordKey(item.keyword))),
  );
}
function restoredSnapshot(
  value: unknown,
): Pick<
  RunState,
  "tailoringId" | "lastPreviewId" | "input" | "step" | "selectedKeywords" | "pendingJobReview"
> | null {
  if (!isRecord(value) || typeof value.tailoringId !== "string" || !value.tailoringId) return null;
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
  const selectedKeywords: KeywordSelection[] = Array.isArray(value.selectedKeywords)
    ? value.selectedKeywords
        .flatMap((item: unknown) =>
          isRecord(item) && typeof item.keyword === "string" && typeof item.attested === "boolean"
            ? [{ keyword: item.keyword, attested: item.attested }]
            : [],
        )
        .slice(0, 30)
    : [];
  return {
    tailoringId: value.tailoringId,
    pendingJobReview: value.pendingJobReview === true,
    lastPreviewId: typeof value.previewId === "string" ? value.previewId : null,
    input,
    step: value.step === 1 || value.step === 2 ? value.step : 0,
    selectedKeywords,
  };
}

function reviewSnapshot(run: RunState): string {
  return JSON.stringify({
    tailoringId: run.tailoringId,
    previewId: run.lastPreviewId,
    input: run.input,
    step: run.step,
    selectedKeywords: run.selectedKeywords,
    pendingJobReview: run.pendingJobReview,
  });
}

export function TailoringProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const ownerId = session?.user?.id ?? null;
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const request = useRef<AbortController | null>(null);
  const jobs = useRef<DurableTailoringJob | null>(null);
  const restoredOwner = useRef<string | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [run, setRun] = useState<RunState>(emptyRun);
  const current = useRef(run);
  const update = useCallback((change: (state: RunState) => RunState) => {
    current.current = change(current.current);
    setRun(current.current);
  }, []);

  useEffect(() => {
    if (
      !run.ownerId ||
      run.ownerId !== ownerId ||
      run.hydrating ||
      restoredOwner.current !== ownerId
    )
      return;
    const key = storageKey(run.ownerId);
    // Persist only the draft pointer, form inputs, step and explicit choices.
    // Resume contents and auth tokens are not copied into this cache.
    const value = run.tailoringId && !run.saved ? reviewSnapshot(run) : null;
    writes.current = writes.current
      .then(() => (value ? AsyncStorage.setItem(key, value) : AsyncStorage.removeItem(key)))
      .catch(() => undefined);
  }, [
    ownerId,
    run.ownerId,
    run.hydrating,
    run.tailoringId,
    run.lastPreviewId,
    run.input,
    run.step,
    run.selectedKeywords,
    run.saved,
    run.pendingJobReview,
  ]);

  const activeRequest = useCallback(
    (controller: AbortController) =>
      !controller.signal.aborted && owner.current === ownerId && request.current === controller,
    [ownerId],
  );
  const acceptPreview = useCallback(
    (preview: TailoringPreview) => {
      update((state) => ({
        ...state,
        ownerId,
        status: "success",
        tailoringId: preview.tailoring_id,
        lastPreviewId: preview.preview.preview_id,
        preview,
        selectedKeywords: remainingSelections(state.selectedKeywords, preview),
        needsReload: false,
        reviewProblem: previewHasExpired(preview)
          ? {
              kind: "expired",
              message:
                "This preview has expired. Your draft and selections are still here. Create a new preview to continue.",
            }
          : null,
      }));
    },
    [ownerId, update],
  );

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    const previousOwner = restoredOwner.current;
    restoredOwner.current = null;
    if (previousOwner && previousOwner !== ownerId)
      writes.current = writes.current
        .then(() => AsyncStorage.removeItem(storageKey(previousOwner)))
        .catch(() => undefined);
    update(() => ({ ...emptyRun, ownerId, hydrating: !!ownerId }));
    let active = true;
    if (!ownerId) return;
    const manager = new DurableTailoringJob({
      uuid: randomUUID,
      read: () => AsyncStorage.getItem(jobStorageKey(ownerId)),
      write: (value) => AsyncStorage.setItem(jobStorageKey(ownerId), value),
      submit: (input, id, signal) => startTailoringJob(ownerId, input, id, signal),
      recent: (signal) => recentTailoringJobs(ownerId, signal),
      progress: (id, signal) => getTailoringProgress(ownerId, id, signal),
      result: (id, signal) => tailoringJobResult(ownerId, id, signal),
      onState: (state) => {
        if (!active || owner.current !== ownerId) return;
        update((value) => {
          const job = state.job;
          const tracking = job && !job.delivered;
          const terminal =
            job?.status === "failed" || job?.status === "interrupted" || !!state.terminalError;
          const finished = state.progress?.updated_at ? Date.parse(state.progress.updated_at) : NaN;
          const newSubmission = job && state.submitting && value.progressId !== job.progressId;
          const regenerating =
            value.preview &&
            !value.saved &&
            job?.input?.resumeId === value.input?.resumeId &&
            job?.input?.jobDescription === value.input?.jobDescription;
          return {
            ...value,
            ...(newSubmission
              ? {
                  preview: regenerating ? value.preview : null,
                  tailoringId: regenerating ? value.tailoringId : null,
                  lastPreviewId: regenerating ? value.lastPreviewId : null,
                  selectedKeywords: regenerating ? value.selectedKeywords : [],
                  step: 0 as const,
                  saved: false,
                  confirmation: null,
                  needsReload: false,
                  pendingJobReview: false,
                  pendingJobProcessing: false,
                }
              : {}),
            jobRecovering: state.recovering || state.submitting,
            jobConnectionError: state.connectionError,
            jobStatus: job?.status ?? null,
            ...(tracking
              ? {
                  status: terminal ? ("error" as const) : ("running" as const),
                  progressId: job.progressId,
                  progress: state.progress,
                  input: job.input,
                  startedAt: job.startedAt,
                  finishedAt:
                    terminal || job.status === "succeeded"
                      ? Number.isFinite(finished)
                        ? finished
                        : (value.finishedAt ?? Date.now())
                      : null,
                  error: state.terminalError,
                  pendingJobProcessing:
                    value.pendingJobProcessing ||
                    (state.recovering && value.progressId !== job.progressId),
                }
              : {}),
            ...(state.terminalError
              ? { status: "error" as const, error: state.terminalError }
              : {}),
          };
        });
      },
      onResult: async (preview, job) => {
        if (!active || owner.current !== ownerId) return;
        const newReview = current.current.tailoringId !== preview.tailoring_id;
        if (current.current.preview?.tailoring_id !== preview.tailoring_id) acceptPreview(preview);
        update((value) => ({
          ...value,
          input: job.input,
          step: newReview ? 0 : value.step,
          progressId: job.progressId,
          jobStatus: "succeeded",
          finishedAt: value.finishedAt ?? Date.now(),
          pendingJobReview: true,
          pendingJobProcessing: false,
        }));
        // Persist the review reference before the durable job is marked delivered.
        const snapshot = reviewSnapshot(current.current);
        writes.current = writes.current
          .catch(() => undefined)
          .then(() => AsyncStorage.setItem(storageKey(ownerId), snapshot));
        await writes.current;
      },
    });
    jobs.current = manager;
    manager.setActive(AppState.currentState === null || AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      manager.setActive(state === "active"),
    );
    void (async () => {
      try {
        await writes.current;
        const raw = await AsyncStorage.getItem(storageKey(ownerId));
        const restored = restoredSnapshot(raw ? (JSON.parse(raw) as unknown) : null);
        if (active && owner.current === ownerId && restored)
          update((state) => ({ ...state, ...restored, status: "success", needsReload: true }));
      } catch {
        /* The server can recover jobs without a device cache. */
      } finally {
        if (active && owner.current === ownerId) {
          restoredOwner.current = ownerId;
          update((state) => ({ ...state, hydrating: false, jobRecovering: true }));
          await manager.restore();
        }
      }
    })();
    return () => {
      active = false;
      manager.dispose();
      subscription.remove();
      request.current?.abort();
      if (jobs.current === manager) jobs.current = null;
    };
  }, [ownerId, update, acceptPreview]);

  const start = useCallback(
    (input: TailoringInput): boolean => {
      if (
        !ownerId ||
        request.current ||
        current.current.hydrating ||
        current.current.jobRecovering ||
        restoredOwner.current !== ownerId
      )
        return false;
      return jobs.current?.start(input) ?? false;
    },
    [ownerId],
  );
  const recoverJob = useCallback(() => {
    void jobs.current?.recover();
  }, []);
  const acknowledgeJobNavigation = useCallback(() => {
    update((value) => ({ ...value, pendingJobReview: false, pendingJobProcessing: false }));
  }, [update]);

  const reloadReview = useCallback(
    async (requestedId?: string): Promise<void> => {
      const id = requestedId ?? current.current.tailoringId;
      if (!id || !ownerId || request.current || current.current.hydrating || current.current.saved)
        return;
      const controller = new AbortController();
      request.current = controller;
      if (id !== current.current.tailoringId)
        update(() => ({
          ...emptyRun,
          ownerId,
          tailoringId: id,
          status: "success",
          needsReload: true,
        }));
      update((state) => ({ ...state, reviewActivity: "load", reviewProblem: null }));
      try {
        const preview = await loadTailoringReview(ownerId, id, controller.signal);
        if (!activeRequest(controller)) return;
        const changed =
          current.current.lastPreviewId &&
          current.current.lastPreviewId !== preview.preview.preview_id;
        acceptPreview(preview);
        if (changed && current.current.step === 2)
          update((state) => ({
            ...state,
            step: 1,
            reviewProblem: {
              kind: "conflict",
              message: "Your draft has changed. Review the latest changes before saving.",
            },
          }));
      } catch (error) {
        if (activeRequest(controller)) {
          const problem = problemFor(error);
          if (
            error instanceof CvApiError &&
            error.status === 409 &&
            /already been saved/i.test(error.message)
          )
            update((state) => ({ ...state, saved: true, reviewProblem: null }));
          else update((state) => ({ ...state, needsReload: true, reviewProblem: problem }));
        }
      } finally {
        if (request.current === controller) {
          request.current = null;
          update((state) => ({ ...state, reviewActivity: null }));
        }
      }
    },
    [ownerId, activeRequest, acceptPreview, update],
  );

  const operate = useCallback(
    (action: "keywords" | "confirm") => {
      const state = current.current;
      const draft = state.preview;
      if (action === "confirm" && state.step !== 2) return;
      if (
        !ownerId ||
        !draft ||
        request.current ||
        state.saved ||
        state.hydrating ||
        state.needsReload
      )
        return;
      if (previewHasExpired(draft)) {
        update((value) => ({
          ...value,
          reviewProblem: {
            kind: "expired",
            message:
              "This preview has expired. Create a new preview before applying keywords or saving.",
          },
        }));
        return;
      }
      const options = draft.review.keyword_options;
      const supported = new Set(options.supported.map(keywordKey));
      const needsAttestation = new Set(options.needs_attestation.map(keywordKey));
      if (
        action === "keywords" &&
        (!state.selectedKeywords.length ||
          state.selectedKeywords.length > options.remaining_slots ||
          state.selectedKeywords.some(
            (item) =>
              !supported.has(keywordKey(item.keyword)) &&
              (!needsAttestation.has(keywordKey(item.keyword)) || !item.attested),
          ))
      ) {
        update((value) => ({
          ...value,
          reviewProblem: {
            kind: "validation",
            message:
              "Choose suggested keywords and select ‘I have this’ for every new skill. Keep within the remaining keyword limit.",
          },
        }));
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      update((value) => ({ ...value, reviewActivity: action, reviewProblem: null }));
      void (async () => {
        try {
          if (action === "keywords") {
            const keywords = state.selectedKeywords.map((item) => ({
              keyword: item.keyword,
              attested: !supported.has(keywordKey(item.keyword)) && item.attested,
            }));
            const next = await applyTailoringKeywords(
              ownerId,
              draft.tailoring_id,
              draft.preview.preview_id,
              keywords,
              controller.signal,
            );
            if (!activeRequest(controller)) return;
            acceptPreview(next);
          } else {
            // Check for changes since the final summary was displayed. A changed
            // draft must be reviewed again; this branch never auto-confirms it.
            const latest = await loadTailoringReview(
              ownerId,
              draft.tailoring_id,
              controller.signal,
            );
            if (!activeRequest(controller)) return;
            acceptPreview(latest);
            if (latest.preview.preview_id !== draft.preview.preview_id) {
              update((value) => ({
                ...value,
                step: 1,
                reviewProblem: {
                  kind: "conflict",
                  message:
                    "Your draft changed since you reviewed it. Check the latest changes, then confirm again.",
                },
              }));
              return;
            }
            if (previewHasExpired(latest)) return;
            const confirmation = await confirmTailoring(
              ownerId,
              draft.tailoring_id,
              controller.signal,
              latest.preview.preview_id,
            );
            if (activeRequest(controller))
              update((value) => ({ ...value, confirmation, saved: true, reviewProblem: null }));
          }
        } catch (error) {
          if (!activeRequest(controller)) return;
          const problem = problemFor(error);
          update((value) => ({ ...value, reviewProblem: problem }));
          if (
            problem.kind === "conflict" ||
            problem.kind === "expired" ||
            problem.kind === "retry"
          ) {
            // Mutations are never automatically retried. First reconcile a
            // possibly completed request with the server's current draft.
            update((value) => ({ ...value, reviewActivity: "load", needsReload: true }));
            try {
              const latest = await loadTailoringReview(
                ownerId,
                draft.tailoring_id,
                controller.signal,
              );
              if (!activeRequest(controller)) return;
              const changed = latest.preview.preview_id !== draft.preview.preview_id;
              acceptPreview(latest);
              if (!previewHasExpired(latest))
                update((value) => ({
                  ...value,
                  step: action === "confirm" && changed ? 1 : value.step,
                  reviewProblem: {
                    kind: problem.kind === "expired" && changed ? "conflict" : problem.kind,
                    message: changed
                      ? "The latest draft is loaded. Check its updated score and changes before continuing."
                      : problem.message +
                        " Your draft and selections are preserved. The latest review is loaded; you can try again.",
                  },
                }));
            } catch (reloadError) {
              if (activeRequest(controller)) {
                if (
                  reloadError instanceof CvApiError &&
                  reloadError.status === 409 &&
                  /already been saved/i.test(reloadError.message)
                )
                  update((value) => ({ ...value, saved: true, reviewProblem: null }));
                else
                  update((value) => ({
                    ...value,
                    needsReload: true,
                    reviewProblem: {
                      ...problemFor(reloadError),
                      message:
                        problem.message +
                        " Reload the review to check its latest state. Your current draft and selections are preserved.",
                    },
                  }));
              }
            }
          }
        } finally {
          if (request.current === controller) {
            request.current = null;
            update((value) => ({ ...value, reviewActivity: null }));
          }
        }
      })();
    },
    [ownerId, activeRequest, acceptPreview, update],
  );

  const setStep = useCallback(
    (step: ReviewStep) => {
      if (!request.current) update((state) => ({ ...state, step }));
    },
    [update],
  );
  const toggleKeyword = useCallback(
    (keyword: string, attested: boolean) => {
      const state = current.current;
      const options = state.preview?.review.keyword_options;
      if (request.current || !options || state.saved || state.needsReload) return;
      const key = keywordKey(keyword);
      const selected = state.selectedKeywords.some((item) => keywordKey(item.keyword) === key);
      if (selected)
        update((value) => ({
          ...value,
          selectedKeywords: value.selectedKeywords.filter(
            (item) => keywordKey(item.keyword) !== key,
          ),
        }));
      else {
        const supported = options.supported.some((item) => keywordKey(item) === key);
        if (
          !supported &&
          (!attested || !options.needs_attestation.some((item) => keywordKey(item) === key))
        )
          return;
        if (state.selectedKeywords.length >= options.remaining_slots) {
          update((value) => ({
            ...value,
            reviewProblem: {
              kind: "validation",
              message: `You can add ${options.remaining_slots} more keyword${options.remaining_slots === 1 ? "" : "s"} to this draft. Deselect one to choose another.`,
            },
          }));
          return;
        }
        update((value) => ({
          ...value,
          selectedKeywords: [
            ...value.selectedKeywords,
            { keyword, attested: !supported && attested },
          ],
          reviewProblem: null,
        }));
      }
    },
    [update],
  );
  const visible = run.ownerId === ownerId ? run : { ...emptyRun, hydrating: !!ownerId };
  return (
    <TailoringContext.Provider
      value={{
        ...visible,
        start,
        recoverJob,
        acknowledgeJobNavigation,
        retry: () => {
          jobs.current?.retry();
        },
        reloadReview,
        applyKeywords: () => operate("keywords"),
        confirm: () => operate("confirm"),
        setStep,
        toggleKeyword,
      }}
    >
      {children}
    </TailoringContext.Provider>
  );
}
export function useTailoring() {
  const context = useContext(TailoringContext);
  if (!context) throw new Error("TailoringProvider is missing.");
  return context;
}
