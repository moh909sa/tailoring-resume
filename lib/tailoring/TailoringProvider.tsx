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
import { previewTailoring } from "@/lib/cv/api";
import type { TailoringInput, TailoringPreview } from "@/lib/tailoring/types";

type RunState = {
  ownerId: string | null;
  status: "idle" | "running" | "success" | "error";
  input: TailoringInput | null;
  preview: TailoringPreview | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
};
const emptyRun: RunState = {
  ownerId: null,
  status: "idle",
  input: null,
  preview: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};
type TailoringContextValue = RunState & {
  start: (input: TailoringInput) => boolean;
  retry: () => void;
};
const TailoringContext = createContext<TailoringContextValue | null>(null);

export function TailoringProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const ownerId = session?.user?.id ?? null;
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const request = useRef<AbortController | null>(null);
  const [run, setRun] = useState<RunState>(emptyRun);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setRun(emptyRun);
    return () => {
      request.current?.abort();
    };
  }, [ownerId]);

  const start = useCallback(
    (input: TailoringInput): boolean => {
      if (!ownerId || request.current) return false;
      const controller = new AbortController();
      // Set the lock synchronously, before React rerenders or navigation runs.
      request.current = controller;
      setRun({
        ownerId,
        status: "running",
        input,
        preview: null,
        startedAt: Date.now(),
        finishedAt: null,
        error: null,
      });
      void (async () => {
        try {
          const preview = await previewTailoring(ownerId, input, controller.signal);
          if (
            controller.signal.aborted ||
            owner.current !== ownerId ||
            request.current !== controller
          )
            return;
          setRun((current) => ({ ...current, status: "success", preview, finishedAt: Date.now() }));
        } catch (error) {
          if (
            controller.signal.aborted ||
            owner.current !== ownerId ||
            request.current !== controller
          )
            return;
          setRun((current) => ({
            ...current,
            status: "error",
            finishedAt: Date.now(),
            error:
              error instanceof Error
                ? error.message
                : "We couldn’t tailor your resume. Please try again.",
          }));
        } finally {
          if (request.current === controller) request.current = null;
        }
      })();
      return true;
    },
    [ownerId],
  );

  const visible = run.ownerId === ownerId ? run : emptyRun;
  function retry() {
    if (visible.status === "error" && visible.input) start(visible.input);
  }
  return (
    <TailoringContext.Provider value={{ ...visible, start, retry }}>
      {children}
    </TailoringContext.Provider>
  );
}

export function useTailoring() {
  const context = useContext(TailoringContext);
  if (!context) throw new Error("TailoringProvider is missing.");
  return context;
}
