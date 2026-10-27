import { isRecord } from "@/lib/cv/types";

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export type TailoringInput = { resumeId: string; filename: string; jobDescription: string };
export type TailoringPreview = {
  tailoring_id: string;
  status: "draft";
  preview: JsonObject & { resume_preview: JsonObject };
};

export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
function isJsonValue(value: unknown): value is JsonValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    isJsonObject(value)
  );
}

export function parseTailoringPreview(value: unknown): TailoringPreview {
  if (
    !isJsonObject(value) ||
    typeof value.tailoring_id !== "string" ||
    !value.tailoring_id ||
    value.status !== "draft" ||
    !isJsonObject(value.preview) ||
    !isJsonObject(value.preview.resume_preview) ||
    !Object.keys(value.preview.resume_preview).length
  ) {
    throw new Error("The tailoring service returned an incomplete preview. Please try again.");
  }
  // Keep the entire server response; no analysis or optional feedback is discarded.
  return {
    ...value,
    tailoring_id: value.tailoring_id,
    status: "draft",
    preview: { ...value.preview, resume_preview: value.preview.resume_preview },
  };
}

export const TAILORING_STAGES = [
  { key: "keywords", label: "Read the job" },
  { key: "plan", label: "Plan the skills to show" },
  { key: "tailor", label: "Tailor the resume" },
  { key: "refine", label: "Work in keywords and check facts" },
  { key: "critique", label: "Critique the writing" },
  { key: "rewrite", label: "Rewrite weak lines" },
  { key: "verify", label: "Verify and prepare the review" },
] as const;
export type StageKey = (typeof TAILORING_STAGES)[number]["key"];
export type StageStatus = "pending" | "running" | "completed" | "skipped";
// Only a future backend progress adapter should supply these statuses.
export type StageProgress = Partial<Record<StageKey, StageStatus>>;

export function elapsedLabel(start: number | null, end: number): string {
  const seconds = start === null ? 0 : Math.max(0, Math.floor((end - start) / 1000));
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0")
  );
}
