import type { DocumentPickerAsset } from "expo-document-picker";
import { validateCv } from "@/lib/cv/types";

export function createCvFormData(asset: DocumentPickerAsset): FormData {
  if (!asset.file) throw new Error("This file could not be read. Please choose it again.");
  const type = validateCv(asset.name, asset.file.size);
  const form = new FormData();
  form.append("file", asset.file.slice(0, asset.file.size, type), asset.name);
  return form;
}
