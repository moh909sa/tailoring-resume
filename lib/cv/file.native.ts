import { File } from "expo-file-system";
import type { DocumentPickerAsset } from "expo-document-picker";
import { validateCv } from "@/lib/cv/types";

export function createCvFormData(asset: DocumentPickerAsset): FormData {
  const size = new File(asset.uri).size;
  const type = validateCv(asset.name, size);
  const form = new FormData();
  // React Native's FormData reads this native URI descriptor as a file, not JSON.
  form.append("file", { uri: asset.uri, name: asset.name, type } as unknown as Blob);
  return form;
}
