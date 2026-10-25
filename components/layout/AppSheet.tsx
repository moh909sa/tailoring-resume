import type { ReactNode } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "@/theming/ThemeProvider";

// Web modals render outside the root DOM tree, so reuse the current theme at their boundary.
export function AppSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemeProvider key={theme.name} initialThemeName={theme.name} themes={[theme]}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="w-full max-w-xl flex-1 self-center">{children}</View>
        </SafeAreaView>
      </ThemeProvider>
    </Modal>
  );
}
