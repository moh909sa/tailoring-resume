import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon from "@/lib/icons/LucideIcon";
import { TAILORING_STAGES, type StageProgress, type StageStatus } from "@/lib/tailoring/types";
import { useReducedMotion } from "@/components/tailoring/ProcessingIndicator";
import { useTheme } from "@/theming/ThemeProvider";
import { cn } from "@/lib/utils";

function StageRow({
  label,
  status,
  number,
  last,
}: {
  label: string;
  status: StageStatus;
  number: number;
  last: boolean;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    fade.setValue(0.4);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [status, reduced, fade]);
  return (
    <Animated.View
      style={{ opacity: fade }}
      accessibilityLabel={`${label}. ${status === "running" ? "In progress" : status === "completed" ? "Completed" : "Waiting for an update"}`}
    >
      <View className="flex-row gap-3.5">
        <View className="items-center">
          <View
            className={cn(
              "h-7 w-7 items-center justify-center rounded-full border",
              status === "completed"
                ? "border-success/20 bg-success/10"
                : status === "running"
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-background",
            )}
          >
            {status === "completed" ? (
              <LucideIcon name="Check" size={15} className="text-success" />
            ) : status === "running" ? (
              <ActivityIndicator size="small" color={theme.colors.primary} animating={!reduced} />
            ) : (
              <Text className="text-caption text-muted-foreground">{number}</Text>
            )}
          </View>
          {!last ? <View style={styles.connector} className="bg-border" /> : null}
        </View>
        <Text
          className={cn(
            "text-body flex-1 pb-5 pt-1 leading-5",
            status === "running"
              ? "text-primary"
              : status === "completed"
                ? "text-foreground"
                : "text-muted-foreground",
          )}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

export function StageTimeline({ progress = {} }: { progress?: StageProgress }) {
  const stages = TAILORING_STAGES.filter((stage) => progress[stage.key] !== "skipped");
  return (
    <View>
      {stages.map((stage, index) => (
        <StageRow
          key={stage.key}
          label={stage.label}
          status={progress[stage.key] ?? "pending"}
          number={index + 1}
          last={index === stages.length - 1}
        />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  connector: { width: 1, flex: 1, minHeight: 13, marginVertical: 4 },
});
