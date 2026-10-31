import { createElement } from "react";

export function PdfViewer({ uri }: { uri: string; onError: () => void }) {
  return createElement("iframe", {
    title: "Your saved CV PDF",
    src: uri,
    style: { width: "100%", height: "100%", border: 0, flex: 1 },
  });
}
