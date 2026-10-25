import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import type { CvNotice } from "@/lib/cv/types";

export function Notice({ tone, message, onDismiss }: CvNotice & { onDismiss?: () => void }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        "flex-row items-start gap-3 rounded-2xl border p-4",
        tone === "error"
          ? "border-destructive/20 bg-destructive/5"
          : tone === "success"
            ? "border-success/20 bg-success/5"
            : "border-primary/20 bg-primary/5",
      )}
    >
      <LucideIcon
        name={tone === "success" ? "CircleCheck" : tone === "error" ? "CircleAlert" : "Info"}
        size={20}
        className={
          tone === "error"
            ? "text-destructive"
            : tone === "success"
              ? "text-success"
              : "text-primary"
        }
      />
      <Text className="text-body flex-1 leading-5 text-foreground">{message}</Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          hitSlop={12}
        >
          <LucideIcon name="X" size={18} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
