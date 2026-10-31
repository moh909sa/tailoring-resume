import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "@/components/ui/text";

export function PdfViewer({ uri, onError }: { uri: string; onError: () => void }) {
  if (Platform.OS !== "ios") return <View className="flex-1 items-center justify-center px-8"><Text className="text-center text-body text-muted-foreground">Your PDF is ready. Use Download PDF to open or save it with your device’s PDF app.</Text></View>;
  return <WebView source={{ uri }} originWhitelist={["file://*"]} javaScriptEnabled={false} onError={onError} onShouldStartLoadWithRequest={(request) => request.url === uri || request.url === "about:blank"} style={styles.viewer} />;
}

const styles = StyleSheet.create({ viewer: { flex: 1 } });
