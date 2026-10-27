import { isRecord } from "@/lib/cv/types";

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export type TailoringInput = { resumeId: string; filename: string; jobDescription: string };
export type ReviewStep = 0 | 1 | 2;
export type KeywordSelection = { keyword: string; attested: boolean };
export const SUMMARY_KEYS = [
  "skills_added",
  "skills_removed",
  "certifications_added",
  "descriptions_modified",
  "high_risk_changes",
  "total_changes",
] as const;
export type ChangeSummary = Record<(typeof SUMMARY_KEYS)[number], number | null>;
export type ResumeChange = {
  field_path: string;
  field_type: string;
  change_type: "added" | "removed" | "modified";
  original_value: string | null;
  new_value: string | null;
  confidence: string | null;
};
export type ChangeSection = { type: string; items: ResumeChange[] };
export type KeywordPlacement = { keyword: string; paths: string[] };
export type TailoringReview = {
  preview_id: string;
  preview_expires_at: string | null;
  keyword_options: {
    supported: string[];
    needs_attestation: string[];
    applied: string[];
    remaining_slots: number;
  };
  ats_score: JsonObject | null;
  score_history: number[];
  keyword_placements: KeywordPlacement[];
  change_summary: ChangeSummary;
  change_sections: ChangeSection[];
  warnings: string[];
};
export type TailoringPreview = {
  tailoring_id: string;
  status: "draft";
  preview: JsonObject & { preview_id: string; resume_preview: JsonObject };
  review: TailoringReview;
};
export type TailoringConfirmation = {
  tailoring_id: string;
  status: "ready";
  tailored_cv: JsonObject;
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
export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}
export function keywordKey(keyword: string): string {
  return keyword.trim().toLocaleLowerCase("en-US");
}
export function atsScore(review: TailoringReview): number | null {
  const score = review.ats_score?.overall_score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}
export function previewHasExpired(preview: TailoringPreview, now = Date.now()): boolean {
  const expires = preview.review.preview_expires_at;
  return !!expires && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= now;
}

export function parseTailoringPreview(value: unknown): TailoringPreview {
  const incomplete = () =>
    new Error(
      "The tailoring service returned an incomplete review. Reload the review to try again.",
    );
  if (
    !isJsonObject(value) ||
    typeof value.tailoring_id !== "string" ||
    !value.tailoring_id ||
    value.status !== "draft" ||
    !isJsonObject(value.preview) ||
    typeof value.preview.preview_id !== "string" ||
    !value.preview.preview_id ||
    !isJsonObject(value.preview.resume_preview) ||
    !Object.keys(value.preview.resume_preview).length ||
    !isJsonObject(value.review) ||
    value.review.preview_id !== value.preview.preview_id ||
    !isJsonObject(value.review.keyword_options)
  )
    throw incomplete();
  const source = value.review;
  const options = value.review.keyword_options;
  if (
    ![options.supported, options.needs_attestation, options.applied].every(
      (items) => Array.isArray(items) && items.every((item) => typeof item === "string"),
    ) ||
    typeof options.remaining_slots !== "number" ||
    !Number.isInteger(options.remaining_slots) ||
    options.remaining_slots < 0 ||
    options.remaining_slots > 30
  )
    throw incomplete();
  const warnings = stringList(source.warnings);
  const summary = isJsonObject(source.change_summary) ? source.change_summary : {};
  const change_summary = Object.fromEntries(
    SUMMARY_KEYS.map((key) => {
      const count = summary[key];
      return [
        key,
        typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null,
      ];
    }),
  ) as ChangeSummary;
  const change_sections: ChangeSection[] = [];
  let incompleteChanges = !Array.isArray(source.change_sections);
  if (Array.isArray(source.change_sections)) {
    for (const section of source.change_sections) {
      if (
        !isJsonObject(section) ||
        typeof section.type !== "string" ||
        !Array.isArray(section.items)
      ) {
        incompleteChanges = true;
        continue;
      }
      const items: ResumeChange[] = [];
      for (const change of section.items) {
        if (
          !isJsonObject(change) ||
          typeof change.field_type !== "string" ||
          !["added", "removed", "modified"].includes(String(change.change_type)) ||
          (change.original_value != null && typeof change.original_value !== "string") ||
          (change.new_value != null && typeof change.new_value !== "string")
        ) {
          incompleteChanges = true;
          continue;
        }
        items.push({
          field_path: typeof change.field_path === "string" ? change.field_path : "",
          field_type: change.field_type,
          change_type: change.change_type as ResumeChange["change_type"],
          original_value: typeof change.original_value === "string" ? change.original_value : null,
          new_value: typeof change.new_value === "string" ? change.new_value : null,
          confidence: typeof change.confidence === "string" ? change.confidence : null,
        });
      }
      if (items.length) change_sections.push({ type: section.type, items });
    }
  }
  if (
    incompleteChanges ||
    (change_summary.total_changes ?? 0) >
      change_sections.reduce((total, section) => total + section.items.length, 0)
  )
    warnings.push(
      "Some change details are unavailable. Reload the review and check the full resume before saving.",
    );
  if (SUMMARY_KEYS.some((key) => change_summary[key] === null))
    warnings.push(
      "The service did not provide a complete change summary. Check the full resume before saving.",
    );
  return {
    ...value,
    tailoring_id: value.tailoring_id,
    status: "draft",
    preview: {
      ...value.preview,
      preview_id: value.preview.preview_id,
      resume_preview: value.preview.resume_preview,
    },
    review: {
      preview_id: value.preview.preview_id,
      preview_expires_at:
        typeof source.preview_expires_at === "string" ? source.preview_expires_at : null,
      keyword_options: {
        supported: stringList(options.supported),
        needs_attestation: stringList(options.needs_attestation),
        applied: stringList(options.applied),
        remaining_slots: options.remaining_slots,
      },
      ats_score: isJsonObject(source.ats_score) ? source.ats_score : null,
      score_history: Array.isArray(source.score_history)
        ? source.score_history.filter(
            (score): score is number => typeof score === "number" && Number.isFinite(score),
          )
        : [],
      keyword_placements: Array.isArray(source.keyword_placements)
        ? source.keyword_placements.flatMap((placement) =>
            isJsonObject(placement) && typeof placement.keyword === "string"
              ? [{ keyword: placement.keyword, paths: stringList(placement.paths) }]
              : [],
          )
        : [],
      change_summary,
      change_sections,
      warnings: [...new Set(warnings)],
    },
  };
}
export function parseTailoringConfirmation(value: unknown): TailoringConfirmation {
  if (
    !isJsonObject(value) ||
    typeof value.tailoring_id !== "string" ||
    !value.tailoring_id ||
    value.status !== "ready" ||
    !isJsonObject(value.tailored_cv) ||
    !Object.keys(value.tailored_cv).length
  )
    throw new Error(
      "The tailoring service returned an incomplete save response. Reload the review before trying again.",
    );
  return { tailoring_id: value.tailoring_id, status: "ready", tailored_cv: value.tailored_cv };
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
export type StageProgress = Partial<Record<StageKey, StageStatus>>;
export function elapsedLabel(start: number | null, end: number): string {
  const seconds = start === null ? 0 : Math.max(0, Math.floor((end - start) / 1000));
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0")
  );
}
