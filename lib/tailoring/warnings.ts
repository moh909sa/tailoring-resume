import type { ReviewStep } from "@/lib/tailoring/types";

export function isGroundingWarning(message: string): boolean {
  return /^\s*GROUNDING_REVIEW_REQUIRED\s*:/i.test(message);
}

// Non-blocking verification summaries belong with the before/after review,
// never in the keyword selection flow. Keep the underlying backend warnings.
export function isRejectedChangeSummary(message: string): boolean {
  return /^\s*\d+\s+change\(s\)\s+rejected during verification\s*$/i.test(message);
}

export function readableReviewWarning(message: string): string {
  if (isRejectedChangeSummary(message)) {
    const count = Number(message.match(/^\s*(\d+)/)?.[1] ?? 0);
    return `${count} suggested ${count === 1 ? "change was" : "changes were"} excluded during verification. Check the updated text before saving.`;
  }
  const detail = message.match(
    /^\s*GROUNDING_REVIEW_REQUIRED:\s*Review\s+workExperience\[(\d+)\]\.description\[(\d+)\]\s+against the source resume\.?\s*$/i,
  );
  if (detail) {
    return `Please check bullet ${Number(detail[2]) + 1} in work experience ${Number(detail[1]) + 1}. Compare the updated wording with your original CV to make sure every claim is accurate. Only keep claims you can support.`;
  }
  return isGroundingWarning(message)
    ? "Please verify the experience changes against your original CV before saving. Only keep claims you can support."
    : message;
}

// Grounding checks stay with the comparisons and final safety review. The
// original backend warnings remain untouched in the draft.
export function reviewWarningsForStep(warnings: string[], step: ReviewStep): string[] {
  return warnings
    .filter((message) => step !== 0 || (!isGroundingWarning(message) && !isRejectedChangeSummary(message)))
    .map(readableReviewWarning);
}
