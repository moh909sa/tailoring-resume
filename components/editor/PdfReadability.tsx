import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import Icon from "@/lib/icons/LucideIcon";
import { checkEditorPdf } from "@/lib/editor/api";
import { pdfReadabilitySummary } from "@/lib/editor/pdfReadability";
import type { PdfPageSize } from "@/lib/editor/pdfTypes";
import type { PdfCheck } from "@/lib/editor/types";

export function PdfReadability({ ownerId, id, revision, pageSize }: { ownerId: string; id: string; revision: number; pageSize: PdfPageSize }) {
  const [check, setCheck] = useState<PdfCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const summary = check ? pdfReadabilitySummary(check) : null;
  const run = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await checkEditorPdf(ownerId, id, revision, pageSize, controller.signal);
      if (!controller.signal.aborted) setCheck(result);
    } catch {
      if (!controller.signal.aborted) setError("PDF checks are unavailable right now. You can still review and download your CV.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (request.current === controller) request.current = null;
    }
  };
  return <View className="gap-2">
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2"><Icon name={summary ? summary.warning ? "CircleAlert" : "Check" : "FileCheck"} className={summary && !summary.warning ? "h-4 w-4 text-success" : "h-4 w-4 text-muted-foreground"} /><Text className="flex-1 text-caption text-foreground">{summary?.title ?? "PDF readability"}</Text></View>
      <Button variant="ghost" size="sm" disabled={loading} onPress={() => void run()}>{loading ? <ActivityIndicator accessibilityLabel="Checking PDF readability" /> : <Text>{check ? "Check again" : "Check PDF"}</Text>}</Button>
    </View>
    {summary ? <ScrollView className="max-h-28" contentContainerClassName="gap-2" nestedScrollEnabled>{summary.messages.map(message => <Text key={message} className="text-caption leading-5 text-muted-foreground">{summary.warning ? "• " : ""}{message}</Text>)}</ScrollView> : null}
    {error ? <Text accessibilityRole="alert" className="text-caption leading-5 text-muted-foreground">{error}</Text> : null}
  </View>;
}
