export const MAX_CV_BYTES = 4 * 1024 * 1024;
export const CV_MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";
export type Resume = {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  processing_status: ProcessingStatus;
  created_at: string;
  recovery_required: boolean;
};
export type CvNotice = { tone: "success" | "error" | "info"; message: string };
export type UploadProgress = { phase: "uploading" | "processing"; percent: number | null };

export function validateCv(name: string, size: number): string {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") {
    throw new Error("Choose a PDF or DOCX file.");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("This file is empty or could not be read. Please choose it again.");
  }
  if (size > MAX_CV_BYTES) {
    throw new Error("This file is too large. Choose a CV of 4 MB or less.");
  }
  return CV_MIME_TYPES[extension];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseResume(value: unknown): Resume {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.original_filename !== "string" ||
    typeof value.mime_type !== "string" ||
    typeof value.file_size_bytes !== "number" ||
    !Number.isFinite(value.file_size_bytes) ||
    typeof value.created_at !== "string" ||
    !["pending", "processing", "ready", "failed"].includes(String(value.processing_status))
  ) {
    throw new Error(
      "The CV service returned an unexpected response. Please refresh and try again.",
    );
  }
  return {
    id: value.id,
    original_filename: value.original_filename,
    mime_type: value.mime_type,
    file_size_bytes: value.file_size_bytes,
    processing_status: value.processing_status as ProcessingStatus,
    created_at: value.created_at,
    recovery_required: value.recovery_required === true,
  };
}

export function parseResumeList(value: unknown): Resume[] {
  if (!Array.isArray(value))
    throw new Error("The CV service returned an unexpected list. Please try again.");
  return value.map(parseResume);
}
