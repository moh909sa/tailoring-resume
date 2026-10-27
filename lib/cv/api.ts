import {
  parseTailoringPreview,
  type TailoringInput,
  type TailoringPreview,
} from "@/lib/tailoring/types";
import { supabase } from "@/lib/supabase";
import {
  isRecord,
  parseResume,
  parseResumeList,
  type Resume,
  type UploadProgress,
} from "@/lib/cv/types";

const API_URL = process.env.EXPO_PUBLIC_RESUME_API_URL?.replace(/\/$/, "");

export class CvApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CvApiError";
  }
}

function endpoint(path: string): string {
  if (!API_URL) throw new Error("The CV service is not configured. Please contact support.");
  return API_URL + "/api/v1/mobile" + path;
}

export function apiErrorMessage(
  status: number,
  payload: unknown,
  fallback = "The CV service could not accept this file. Please try again.",
): string {
  if (status === 401) return "Your sign-in was not accepted. Sign out and sign in again.";
  if (status === 403) return "Your account cannot access this CV. Please contact support.";
  if (status === 413) return "This file is too large. Choose a CV of 4 MB or less.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (isRecord(payload)) {
    if (typeof payload.detail === "string") return payload.detail.slice(0, 500);
    if (Array.isArray(payload.detail)) {
      const messages = payload.detail.flatMap((item) =>
        isRecord(item) && typeof item.msg === "string" ? [item.msg] : [],
      );
      if (messages.length) return messages.join(" ").slice(0, 500);
    }
  }
  return status >= 500
    ? "The CV service could not finish this request. Please try again."
    : fallback;
}

function decodeResponse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function accessToken(ownerId: string, forceRefresh = false): Promise<string> {
  if (!supabase) throw new Error("Please sign in before uploading a CV.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token || data.session.user.id !== ownerId) {
    throw new CvApiError("Please sign in to see and upload your CVs.", 401);
  }
  if (forceRefresh || (data.session.expires_at ?? 0) <= Date.now() / 1000 + 60) {
    const refreshed = await supabase.auth.refreshSession();
    if (
      refreshed.error ||
      !refreshed.data.session?.access_token ||
      refreshed.data.session.user.id !== ownerId
    ) {
      throw new CvApiError("Your session has expired. Please sign in again.", 401);
    }
    return refreshed.data.session.access_token;
  }
  return data.session.access_token;
}

export async function listResumes(ownerId: string, signal: AbortSignal): Promise<Resume[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(ownerId, attempt === 1);
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) timeout.abort();
    const timer = setTimeout(abort, 30000);
    try {
      const response = await fetch(endpoint("/resumes"), {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        signal: timeout.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok)
        throw new CvApiError(apiErrorMessage(response.status, payload), response.status);
      return parseResumeList(payload);
    } catch (error) {
      if (error instanceof CvApiError) throw error;
      if (signal.aborted) throw new Error("Request canceled.");
      if (timeout.signal.aborted)
        throw new Error("Your CVs took too long to load. Please try again.");
      if (error instanceof Error && error.message.startsWith("The CV service returned"))
        throw error;
      throw new Error("Your CVs could not be loaded. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw new CvApiError("Please sign in again.", 401);
}

export async function deleteResume(
  ownerId: string,
  resumeId: string,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(ownerId, attempt === 1);
    if (signal.aborted) throw new Error("Delete canceled.");
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 30000);
    try {
      const response = await fetch(endpoint("/resumes/" + encodeURIComponent(resumeId)), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        signal: timeout.signal,
      });
      // A successful deletion has no response body.
      if (response.status === 204) return;
      if (response.status === 401 && attempt === 0) continue;
      const payload: unknown = await response.json().catch(() => null);
      throw new CvApiError(
        response.ok
          ? "The CV service did not confirm deletion. Refresh your CVs before trying again."
          : apiErrorMessage(
              response.status,
              payload,
              "Your CV could not be deleted. Please try again.",
            ),
        response.status,
      );
    } catch (error) {
      if (error instanceof CvApiError) throw error;
      if (signal.aborted) throw new Error("Delete canceled.");
      if (timeout.signal.aborted)
        throw new Error("Deleting your CV took too long. Refresh your CVs before trying again.");
      throw new Error("Your CV could not be deleted. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw new CvApiError("Please sign in again.", 401);
}

export async function uploadResume(
  ownerId: string,
  form: FormData,
  signal: AbortSignal,
  onProgress: (progress: UploadProgress) => void,
): Promise<Resume> {
  const token = await accessToken(ownerId);
  if (signal.aborted) throw new Error("Upload canceled.");
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("POST", endpoint("/resumes/upload"));
    // Processing is synchronous on this backend; keep waiting after bytes finish.
    request.timeout = 300000;
    request.setRequestHeader("Authorization", "Bearer " + token);
    request.setRequestHeader("Accept", "application/json");
    // Never set Content-Type: FormData supplies the multipart boundary.
    request.upload.onprogress = (event) => {
      const complete = event.lengthComputable && event.loaded >= event.total;
      onProgress({
        phase: complete ? "processing" : "uploading",
        percent: event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null,
      });
    };
    request.upload.onload = () => onProgress({ phase: "processing", percent: 100 });
    request.onload = () => {
      cleanup();
      const payload = decodeResponse(request.responseText);
      if (request.status < 200 || request.status >= 300) {
        reject(new CvApiError(apiErrorMessage(request.status, payload), request.status));
        return;
      }
      try {
        resolve(parseResume(payload));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => {
      cleanup();
      reject(
        new Error("The upload service could not be reached. Check your connection and try again."),
      );
    };
    request.ontimeout = () => {
      cleanup();
      reject(new Error("The upload timed out while your CV was processing."));
    };
    request.onabort = () => {
      cleanup();
      reject(new Error("Upload canceled."));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      request.send(form);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function previewTailoring(
  ownerId: string,
  input: TailoringInput,
  signal: AbortSignal,
): Promise<TailoringPreview> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(ownerId, attempt === 1);
    if (signal.aborted) throw new Error("Tailoring canceled.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    // Full AI tailoring is synchronous and may take several minutes.
    const timer = setTimeout(abort, 600000);
    try {
      const response = await fetch(endpoint("/tailor/preview"), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resume_id: input.resumeId, job_description: input.jobDescription }),
        signal: controller.signal,
      });
      if (response.status === 401 && attempt === 0) continue;
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new CvApiError(
          apiErrorMessage(
            response.status,
            payload,
            "We couldn’t tailor this resume. Please try again.",
          ),
          response.status,
        );
      return parseTailoringPreview(payload);
    } catch (error) {
      if (error instanceof CvApiError) throw error;
      if (signal.aborted) throw new Error("Tailoring canceled.");
      if (controller.signal.aborted)
        throw new Error(
          "This request took too long. It may still be finishing. Wait a moment before trying again.",
        );
      if (error instanceof Error && error.message.startsWith("The tailoring service returned"))
        throw error;
      throw new Error(
        "We couldn’t reach the tailoring service. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw new CvApiError("Please sign in again.", 401);
}
