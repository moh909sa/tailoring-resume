import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function AppScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <View className="w-full max-w-xl flex-1 self-center">{children}</View>
    </SafeAreaView>
  );
}
