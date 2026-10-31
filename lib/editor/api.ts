import { apiErrorMessage, CvApiError, mobileAccessToken, mobileEndpoint } from "@/lib/cv/api";
import { parseEditorAnalysis, parseEditorDocument, parseTailoredCvs, parsePdfCheck, type EditorDocument, type EditorSave } from "./types";

async function request<T>(ownerId: string, path: string, signal: AbortSignal, parse: (value: unknown) => T, method = "GET", body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await mobileAccessToken(ownerId, attempt === 1);
    if (signal.aborted) throw new Error("Request canceled.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 45000);
    try {
      const response = await fetch(mobileEndpoint(path), {method, signal: controller.signal, headers: {Authorization: "Bearer " + token, Accept: "application/json", ...(body === undefined ? {} : {"Content-Type":"application/json"})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) throw new CvApiError(apiErrorMessage(response.status, payload, "Your CV could not be saved. Your edits are kept on this device."), response.status);
      return parse(payload);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw new CvApiError("Please sign in again to open your CV.", 401);
}
const pathFor = (id: string) => "/tailored-cvs/" + encodeURIComponent(id);
function sameDocument(id: string, value: unknown): EditorDocument {
  const doc = parseEditorDocument(value);
  if (doc.tailoring_id !== id) throw new Error("The service returned a different CV. Reload before editing.");
  return doc;
}
export const getEditorDocument = (ownerId: string, id: string, signal: AbortSignal) => request(ownerId, pathFor(id) + "/editor", signal, v => sameDocument(id, v));
export const saveEditorDocument = (ownerId: string, id: string, body: EditorSave, signal: AbortSignal) => request(ownerId, pathFor(id) + "/editor", signal, v => sameDocument(id, v), "PATCH", body);
export const getEditorAnalysis = (ownerId: string, id: string, signal: AbortSignal) => request(ownerId, pathFor(id) + "/ats-score", signal, parseEditorAnalysis);
export const recalculateEditorAnalysis = (ownerId: string, id: string, revision: number, signal: AbortSignal) => request(ownerId, pathFor(id) + "/ats-score", signal, parseEditorAnalysis, "POST", {expected_revision: revision});
export const listTailoredCvs = (ownerId: string, signal: AbortSignal, offset = 0, limit = 30) => request(ownerId, "/tailored-cvs?status=ready&limit=" + limit + "&offset=" + offset, signal, parseTailoredCvs);
export const checkEditorPdf = (ownerId: string, id: string, revision: number, pageSize: "A4" | "LETTER", signal: AbortSignal) => request(ownerId, pathFor(id) + "/parse-check", signal, value => {
  const check = parsePdfCheck(value);
  if (check.revision !== revision) throw new Error("This check belongs to another saved version. Check the PDF again.");
  return check;
}, "POST", {expected_revision: revision, page_size: pageSize});
