import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import { mobileAccessToken, mobileEndpoint } from "@/lib/cv/api";
import { pdfPath, pdfPageCount, validatePdfResponse, type EditorPdf, type PdfPageSize } from "./pdfTypes";

export async function loadEditorPdf(ownerId: string, id: string, revision: number, pageSize: PdfPageSize, signal: AbortSignal): Promise<EditorPdf> {
  if (!FileSystem.cacheDirectory) throw new Error("PDF storage is unavailable on this device.");
  const directory = `${FileSystem.cacheDirectory}cv-preview-${Crypto.randomUUID()}/`;
  const filename = `Tailored-CV-v${revision}.pdf`;
  const uri = directory + filename;
  const dispose = async () => { await FileSystem.deleteAsync(directory, { idempotent: true }); };
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await mobileAccessToken(ownerId, attempt === 1);
    if (signal.aborted) throw new Error("PDF preview canceled.");
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    if (signal.aborted) { await dispose(); throw new Error("PDF preview canceled."); }
    const task = FileSystem.createDownloadResumable(mobileEndpoint(pdfPath(id, revision, pageSize)), uri, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
      cache: false,
      sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    });
    const abort = () => { void task.cancelAsync().catch(() => undefined); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const result = await task.downloadAsync();
      if (!result || signal.aborted) throw new Error("PDF preview canceled.");
      if (result.status === 401 && attempt === 0) { await dispose(); continue; }
      const header = (name: string) => Object.entries(result.headers).find(([key]) => key.toLowerCase() === name)?.[1] ?? null;
      validatePdfResponse(result.status, result.mimeType ?? header("content-type"), header("x-resume-revision"), revision);
      const signature = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 5 });
      if (signature !== "JVBERi0=") throw new Error("The service returned an unreadable PDF. Please try again.");
      return { uri, filename, revision, pageCount: pdfPageCount(header("x-pdf-page-count")), dispose };
    } catch (error) {
      await dispose();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  await dispose();
  throw new Error("Please sign in again to preview this CV.");
}

export async function shareEditorPdf(pdf: EditorPdf): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable on this device.");
  await Sharing.shareAsync(pdf.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Save or share your CV" });
}
