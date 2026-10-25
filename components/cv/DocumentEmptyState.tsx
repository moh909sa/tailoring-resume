import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon, { type IconName } from "@/lib/icons/LucideIcon";

export function DocumentEmptyState({
  title,
  description,
  icon = "FileText",
  action,
}: {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <View className="items-center px-6 py-12">
      <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl bg-primary/5">
        <LucideIcon name={icon} size={34} strokeWidth={1.35} className="text-primary" />
      </View>
      <Text className="text-h3 text-center tracking-tight text-foreground">{title}</Text>
      <Text className="text-body mt-3 max-w-xs text-center leading-6 text-muted-foreground">
        {description}
      </Text>
      {action ? <View className="mt-6">{action}</View> : null}
    </View>
  );
}
