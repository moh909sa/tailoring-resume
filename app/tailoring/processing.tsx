import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { ActivityIndicator, BackHandler, ScrollView, View } from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import { ProcessingIndicator } from "@/components/tailoring/ProcessingIndicator";
import { StageTimeline } from "@/components/tailoring/StageTimeline";
import { useTailoring } from "@/lib/tailoring/TailoringProvider";
import { elapsedLabel } from "@/lib/tailoring/types";
import { useTheme } from "@/theming/ThemeProvider";
import LucideIcon from "@/lib/icons/LucideIcon";

export default function TailoringProcessingScreen() {
  const run = useTailoring();
  const { theme } = useTheme();
  const running = run.status === "running";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => {
      clearInterval(timer);
      back.remove();
    };
  }, [running, run.startedAt]);
  useEffect(() => {
    if (run.status === "success" && run.preview)
      router.replace({
        pathname: "/tailoring/review",
        params: { tailoringId: run.preview.tailoring_id },
      });
  }, [run.status, run.preview]);

  function editInputs() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/tailor");
  }
  return (
    <AppScreen>
      <Stack.Screen options={{ title: "Tailoring your resume", gestureEnabled: !running }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-6 pb-8 pt-8"
      >
        <View className="items-center gap-5">
          <ProcessingIndicator active={running} />
          <View className="items-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-h2 text-center tracking-tight text-foreground"
            >
              Working on your resume
            </Text>
            <Text className="text-body text-center leading-6 text-muted-foreground">
              Our AI is tailoring your resume to match your next opportunity.
            </Text>
          </View>
          {run.startedAt !== null ? (
            <View
              accessibilityLabel="Elapsed time"
              className="flex-row items-center gap-2 rounded-full bg-secondary px-4 py-2"
            >
              <LucideIcon name="Clock3" size={14} className="text-muted-foreground" />
              <Text className="text-h6 tabular-nums text-foreground">
                {elapsedLabel(run.startedAt, run.finishedAt ?? now)}
              </Text>
              <Text className="text-caption text-muted-foreground">elapsed</Text>
            </View>
          ) : null}
        </View>
        {run.status === "error" ? (
          <View className="mt-8 gap-4">
            <Text className="text-h4 text-foreground">We couldn’t finish this time</Text>
            <Notice tone="error" message={run.error ?? "Please try again."} />
            <Text className="text-body leading-6 text-muted-foreground">
              Your CV selection and job description are still here.
            </Text>
            <Button onPress={run.retry} className="h-14 rounded-2xl">
              <Text>Retry</Text>
            </Button>
            <Button variant="ghost" onPress={editInputs}>
              <Text>Back to Tailor CV</Text>
            </Button>
          </View>
        ) : run.status === "idle" ? (
          <View className="mt-8 gap-4">
            <Text className="text-body text-center leading-6 text-muted-foreground">
              Choose your CV and paste a job description to get started.
            </Text>
            <Button onPress={editInputs} className="h-14 rounded-2xl">
              <Text>Go to Tailor CV</Text>
            </Button>
          </View>
        ) : (
          <View className="mt-8 gap-5">
            <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2.5">
              {running ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <LucideIcon name="FileCheck" size={17} className="text-success" />
              )}
              <Text className="text-h6 text-foreground">
                {running ? "Preparing your tailored preview" : "Opening your review"}
              </Text>
            </View>
            <View className="rounded-2xl border border-border bg-card px-4 pb-1 pt-5">
              <StageTimeline />
            </View>
            <Text className="text-caption text-center leading-5 text-muted-foreground">
              {running && run.startedAt !== null && now - run.startedAt >= 30000
                ? "A thoughtful rewrite can take a few minutes. "
                : ""}
              Your preview will open automatically when it’s ready. Individual stage updates aren’t
              available yet.
            </Text>
            <View className="flex-row items-center justify-center gap-2 pb-2">
              <LucideIcon name="ShieldCheck" size={14} className="text-muted-foreground" />
              <Text className="text-caption text-muted-foreground">
                Your original CV stays unchanged
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </AppScreen>
  );
}
