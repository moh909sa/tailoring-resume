import { mobileAccessToken, mobileEndpoint } from "@/lib/cv/api";
import { pdfPath, pdfPageCount, validatePdfResponse, type EditorPdf, type PdfPageSize } from "./pdfTypes";

export async function loadEditorPdf(ownerId: string, id: string, revision: number, pageSize: PdfPageSize, signal: AbortSignal): Promise<EditorPdf> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await mobileAccessToken(ownerId, attempt === 1);
    const response = await fetch(mobileEndpoint(pdfPath(id, revision, pageSize)), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
      signal,
      cache: "no-store",
    });
    if (response.status === 401 && attempt === 0) continue;
    validatePdfResponse(response.status, response.headers.get("content-type"), response.headers.get("x-resume-revision"), revision);
    const blob = await response.blob();
    if ((await blob.slice(0, 5).text()) !== "%PDF-") throw new Error("The service returned an unreadable PDF. Please try again.");
    if (signal.aborted) throw new Error("PDF preview canceled.");
    const uri = URL.createObjectURL(blob);
    return { uri, filename: `Tailored-CV-v${revision}.pdf`, revision, pageCount: pdfPageCount(response.headers.get("x-pdf-page-count")), dispose: async () => URL.revokeObjectURL(uri) };
  }
  throw new Error("Please sign in again to preview this CV.");
}

export async function shareEditorPdf(pdf: EditorPdf): Promise<void> {
  const anchor = globalThis.document.createElement("a");
  anchor.href = pdf.uri;
  anchor.download = pdf.filename;
  globalThis.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
