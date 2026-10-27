import type { ReviewStep } from "@/lib/tailoring/types";

export function isGroundingWarning(message: string): boolean {
  return /^\s*GROUNDING_REVIEW_REQUIRED\s*:/i.test(message);
}

export function readableReviewWarning(message: string): string {
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
    .filter((message) => step !== 0 || !isGroundingWarning(message))
    .map(readableReviewWarning);
}
