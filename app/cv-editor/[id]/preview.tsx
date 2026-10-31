import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getEditorDocument } from "@/lib/editor/api";
import { loadEditorPdf, shareEditorPdf } from "@/lib/editor/pdf";
import type { EditorPdf, PdfPageSize } from "@/lib/editor/pdfTypes";
import { PdfViewer } from "@/components/editor/PdfViewer";
import { PdfReadability } from "@/components/editor/PdfReadability";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import Icon from "@/lib/icons/LucideIcon";

type Preview = { ownerId: string; id: string; pdf: EditorPdf };

export default function CvPdfPreview() {
  const params = useLocalSearchParams<{ id: string; revision?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const expectedRevision = params.revision ? Number(params.revision) : undefined;
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const ownerId = session?.user.id;
  const [pageSize, setPageSize] = useState<PdfPageSize>("A4");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [viewError, setViewError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pdf = preview && preview.ownerId === ownerId && preview.id === id ? preview.pdf : null;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (id) router.replace({ pathname: "/cv-editor/[id]", params: { id } });
    else router.replace("/(tabs)/library/tailored-cvs");
  };

  useEffect(() => {
    setPreview(null);
    setError(null);
    setViewError(false);
    if (!ownerId || !id) return;
    const controller = new AbortController();
    let current = true;
    let artifact: EditorPdf | null = null;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 120000);
    void (async () => {
      try {
        const document = await getEditorDocument(ownerId, id, controller.signal);
        if (expectedRevision !== undefined && document.revision !== expectedRevision) throw new Error("A newer version of this CV has been saved. Return to the editor, reload the saved version, and preview again.");
        const loadedPdf = await loadEditorPdf(ownerId, id, document.revision, pageSize, controller.signal);
        artifact = loadedPdf;
        if (!current || controller.signal.aborted) { await loadedPdf.dispose(); return; }
        setPreview({ ownerId, id, pdf: loadedPdf });
      } catch (cause) {
        if (current) setError(controller.signal.aborted ? "Generating your PDF took too long. Please try again." : cause instanceof Error ? cause.message : "Your PDF could not be loaded. Please try again.");
      } finally {
        clearTimeout(timeout);
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
      void artifact?.dispose().catch(() => undefined);
    };
  }, [ownerId, id, expectedRevision, pageSize, attempt]);

  async function download() {
    if (!pdf || sharing) return;
    setSharing(true);
    setError(null);
    try { await shareEditorPdf(pdf); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your PDF could not be shared. Please try again."); }
    finally { setSharing(false); }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Preview PDF", headerShown: false }} />
      <View className="w-full max-w-3xl flex-1 self-center">
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back to CV editor" className="h-11 w-11 items-center justify-center rounded-full bg-secondary" onPress={goBack}><Icon name="ChevronLeft" className="h-5 w-5 text-foreground" /></Pressable>
          <View className="flex-1"><Text className="text-h4 text-foreground">Preview PDF</Text><Text className="text-caption text-muted-foreground">{pdf ? `Version ${pdf.revision}${pdf.pageCount ? ` · ${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"}` : " · actual export"}` : "Your final document"}</Text></View>
          <View className="flex-row rounded-lg border border-border p-1">
            {(["A4", "LETTER"] as const).map(size => <Pressable key={size} disabled={sharing} accessibilityRole="button" accessibilityLabel={`${size === "A4" ? "A4" : "Letter"} paper size`} accessibilityState={{ selected: pageSize === size, disabled: sharing }} onPress={() => setPageSize(size)} className={`min-h-10 justify-center rounded-md px-3 ${pageSize === size ? "bg-primary" : "bg-background"}`}><Text className={pageSize === size ? "text-caption text-primary-foreground" : "text-caption text-muted-foreground"}>{size === "A4" ? "A4" : "Letter"}</Text></Pressable>)}
          </View>
        </View>

        {authLoading || (ownerId && (loading || (!pdf && !error))) ? <View className="flex-1 items-center justify-center gap-4 px-8"><ActivityIndicator size="large" /><Text className="text-body text-muted-foreground">Preparing your saved CV…</Text></View> : !ownerId ? <View className="flex-1 items-center justify-center gap-4 px-8"><Text className="text-center text-body text-muted-foreground">Please sign in to preview your CV.</Text><Button onPress={goBack}><Text>Return to editor</Text></Button></View> : pdf ? <View className="flex-1 overflow-hidden bg-muted">{viewError ? <View className="flex-1 items-center justify-center px-8"><Text className="text-center text-body text-muted-foreground">The preview could not be displayed. Your PDF is ready to download below.</Text></View> : <PdfViewer uri={pdf.uri} onError={() => setViewError(true)} />}</View> : <View className="flex-1 items-center justify-center gap-4 px-8"><Icon name="FileText" className="h-10 w-10 text-muted-foreground" /><Text className="text-center text-h4 text-foreground">PDF unavailable</Text><Text accessibilityRole="alert" className="text-center text-body text-muted-foreground">{error || "Your PDF could not be loaded."}</Text><Button onPress={() => setAttempt(value => value + 1)}><Text>Try again</Text></Button><Button variant="ghost" onPress={goBack}><Text>Return to editor</Text></Button></View>}

        <View className="gap-3 border-t border-border px-5 py-4">
          {pdf && ownerId ? <PdfReadability key={pdf.uri} ownerId={ownerId} id={id} revision={pdf.revision} pageSize={pageSize} /> : null}
          {pdf && error ? <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text> : null}
          <Button className="flex-row gap-2 rounded-xl" disabled={!pdf || loading || sharing} onPress={() => void download()}>{sharing ? <ActivityIndicator /> : <Icon name="Download" className="h-5 w-5 text-primary-foreground" />}<Text>{sharing ? "Opening…" : "Download PDF"}</Text></Button>
          <Text className="text-center text-caption text-muted-foreground">{Platform.OS === "ios" ? "Choose Save to Files in the share sheet, or share your CV directly." : "Downloads the same saved document shown in this preview."}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
