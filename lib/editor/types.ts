import { isJsonObject, stringList, type JsonObject } from "@/lib/tailoring/types";
import { isRecord } from "@/lib/cv/types";
export type { JsonObject, JsonValue } from "@/lib/tailoring/types";

export type EditorAnalysis = {
  status: "current" | "stale" | "unavailable";
  revision: number;
  calculated_at: string | null;
  score: {
    overall_score: number;
    sub_scores: Record<string, number | null>;
    missing_keywords: string[];
    injectable_keywords: string[];
    recommendations: string[];
  } | null;
  matched_keywords: string[];
  missing_keywords: string[];
  required_skills: string[];
  preferred_skills: string[];
  total_keywords: number;
  matched_count: number;
  scoring_version: string;
  job_hash: string;
  reason?: string;
};
export type EditorDocument = {
  tailoring_id: string;
  revision: number;
  updated_at: string;
  resume: JsonObject;
  job: { title: string | null; company: string | null; description: string };
  confirmed_skills: string[];
  analysis: EditorAnalysis | null;
};
export type EditorSave = {
  expected_revision: number;
  mutation_id: string;
  resume: JsonObject;
  confirmed_skills: string[];
};
export type TailoredCvSummary = {
  id: string;
  job_title: string | null;
  company: string | null;
  status: "draft" | "ready";
  created_at: string;
  updated_at: string;
};
const revision = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1;
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const textOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function parseEditorAnalysis(value: unknown): EditorAnalysis {
  const invalid = () => new Error("The service returned incomplete job-match details. Try updating the match again.");
  if (!isRecord(value) || !["current", "stale", "unavailable"].includes(String(value.status)) || !revision(value.revision)) throw invalid();
  let score: EditorAnalysis["score"] = null;
  if (value.score !== null && value.score !== undefined) {
    const s = value.score;
    if (!isRecord(s) || typeof s.overall_score !== "number" || !Number.isFinite(s.overall_score) || s.overall_score < 0 || s.overall_score > 100 || !isRecord(s.sub_scores)) throw invalid();
    const sub: Record<string, number | null> = {};
    for (const [key, n] of Object.entries(s.sub_scores)) {
      if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100)) throw invalid();
      sub[key] = n as number | null;
    }
    score = { overall_score: s.overall_score, sub_scores: sub, missing_keywords: stringList(s.missing_keywords), injectable_keywords: stringList(s.injectable_keywords), recommendations: stringList(s.recommendations) };
  }
  if (value.status === "current" && !score) throw invalid();
  if (!count(value.total_keywords) || !count(value.matched_count) || (value.matched_count as number) > (value.total_keywords as number)) throw invalid();
  return { status: value.status as EditorAnalysis["status"], revision: value.revision, calculated_at: textOrNull(value.calculated_at), score, matched_keywords: stringList(value.matched_keywords), missing_keywords: stringList(value.missing_keywords), required_skills: stringList(value.required_skills), preferred_skills: stringList(value.preferred_skills), total_keywords: value.total_keywords as number, matched_count: value.matched_count as number, scoring_version: typeof value.scoring_version === "string" ? value.scoring_version : "", job_hash: typeof value.job_hash === "string" ? value.job_hash : "", ...(typeof value.reason === "string" ? { reason: value.reason } : {}) };
}

export function parseEditorDocument(value: unknown): EditorDocument {
  if (!isRecord(value) || typeof value.tailoring_id !== "string" || !value.tailoring_id || !revision(value.revision) || typeof value.updated_at !== "string" || !isJsonObject(value.resume) || !Object.keys(value.resume).length || !isRecord(value.job) || typeof value.job.description !== "string" || !Array.isArray(value.confirmed_skills) || !value.confirmed_skills.every(v => typeof v === "string")) throw new Error("The service returned an incomplete CV. Reload before editing.");
  return { tailoring_id: value.tailoring_id, revision: value.revision, updated_at: value.updated_at, resume: value.resume, job: {title: textOrNull(value.job.title), company: textOrNull(value.job.company), description: value.job.description}, confirmed_skills: stringList(value.confirmed_skills), analysis: value.analysis ? parseEditorAnalysis(value.analysis) : null };
}

export function parseTailoredCvs(value: unknown): TailoredCvSummary[] {
  if (!Array.isArray(value)) throw new Error("Your saved CVs could not be read. Please try again.");
  return value.map(row => {
    if (!isRecord(row) || typeof row.id !== "string" || !["draft", "ready"].includes(String(row.status)) || typeof row.created_at !== "string" || typeof row.updated_at !== "string") throw new Error("Your saved CVs could not be read. Please try again.");
    return { id: row.id, job_title: textOrNull(row.job_title), company: textOrNull(row.company), status: row.status as TailoredCvSummary["status"], created_at: row.created_at, updated_at: row.updated_at };
  });
}

export type PdfCheck = {
  revision: number;
  report: {
    extractability: "full" | "partial" | "none";
    page_count: number | null;
    checks: { id: string; status: "pass" | "warn" | "fail"; params: Record<string, unknown> }[];
    roundtrip: { truncated: boolean; fields: { field: string; status: "found" | "garbled" | "missing" | "hidden" }[] } | null;
  };
};

export function parsePdfCheck(value: unknown): PdfCheck {
  const invalid = () => new Error("The PDF check could not be read. Your PDF can still be downloaded.");
  if (!isRecord(value) || !revision(value.revision) || !isRecord(value.report)) throw invalid();
  const report = value.report;
  if (!["full", "partial", "none"].includes(String(report.extractability)) || !Array.isArray(report.checks)) throw invalid();
  if (report.page_count !== null && !(typeof report.page_count === "number" && Number.isSafeInteger(report.page_count) && report.page_count > 0)) throw invalid();
  const checks = report.checks.map(check => {
    if (!isRecord(check) || typeof check.id !== "string" || !["pass", "warn", "fail"].includes(String(check.status))) throw invalid();
    return { id: check.id, status: check.status as "pass" | "warn" | "fail", params: isRecord(check.params) ? check.params : {} };
  });
  let roundtrip: PdfCheck["report"]["roundtrip"] = null;
  if (report.roundtrip !== null && report.roundtrip !== undefined) {
    if (!isRecord(report.roundtrip) || !Array.isArray(report.roundtrip.fields)) throw invalid();
    roundtrip = { truncated: report.roundtrip.truncated === true, fields: report.roundtrip.fields.map(field => {
      if (!isRecord(field) || typeof field.field !== "string" || !["found", "garbled", "missing", "hidden"].includes(String(field.status))) throw invalid();
      return { field: field.field, status: field.status as "found" | "garbled" | "missing" | "hidden" };
    }) };
  }
  return { revision: value.revision, report: { extractability: report.extractability as PdfCheck["report"]["extractability"], page_count: report.page_count as number | null, checks, roundtrip } };
}
