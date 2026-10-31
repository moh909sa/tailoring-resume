import type { PdfCheck } from "./types";

const messages: Record<string, string> = {
  text_layer: "Very little readable text was found. Check that your content appears on every page.",
  garbled_glyphs: "Some characters may not extract correctly. Check names, symbols, and special characters.",
  text_coverage: "Some pages contain little extractable text. Review those pages before sharing.",
  multi_column: "Text may be read in an unexpected order. Review the document’s reading flow.",
  tables: "Tables may affect the order in which text is read.",
  text_boxes: "Some text may sit outside the main reading flow.",
  header_footer_content: "Check repeated headers and footers, and keep essential contact details in the main document.",
  images: "Images were found. Any important information in an image should also appear as text.",
  page_count: "Review the document’s length and make sure every page is complete.",
  contact_info: "Check that your email and phone number appear clearly near the top of the CV.",
  section_headings: "Some standard section headings were not recognized. Check that your experience, education, and skills are easy to find.",
  dates: "Dates were not clearly recognized. Check the dates beside your experience and education.",
};

export function pdfReadabilitySummary(check: PdfCheck): { title: string; messages: string[]; warning: boolean } {
  const report = check.report;
  const issues: string[] = [];
  if (report.extractability === "none") issues.push("The PDF’s text could not be extracted. Review the document before sharing.");
  else if (report.extractability === "partial") issues.push("Only part of the PDF’s text could be extracted. Review all pages before sharing.");
  for (const item of report.checks) {
    if (item.status !== "pass") issues.push(messages[item.id] ?? "A document check needs review. Check the PDF’s text and layout before sharing.");
  }
  if (report.roundtrip?.truncated) issues.push("The check could not examine the whole document. Review every page.");
  if (report.roundtrip?.fields.some(field => field.status === "missing" || field.status === "garbled")) issues.push("Some saved content was missing or unclear in the extracted PDF text. Review all sections before sharing.");
  const unique = [...new Set(issues)];
  return { title: unique.length ? "PDF checks need a look" : "PDF readability checks passed", messages: unique.length ? unique : ["Text was extracted successfully and the available document checks passed."], warning: unique.length > 0 };
}
