import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View className="min-h-16 flex-row items-center justify-between gap-3 px-6 py-3">
      <Text accessibilityRole="header" className="text-h2 tracking-tight text-foreground">
        {title}
      </Text>
      {action}
    </View>
  );
}
