import { useState } from "react";
import { router, Stack } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import { ReviewContent, reviewItems } from "@/components/tailoring/ReviewContent";
import { useTailoring } from "@/lib/tailoring/TailoringProvider";
import LucideIcon from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "resume", label: "Resume" },
  { key: "analysis", label: "Analysis" },
  { key: "changes", label: "Changes" },
] as const;
export default function TailoringReviewScreen() {
  const run = useTailoring();
  const [tab, setTab] = useState<"resume" | "analysis" | "changes">("resume");
  const preview = run.preview?.preview;
  function back() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/tailor");
  }
  if (!preview)
    return (
      <AppScreen>
        <Stack.Screen options={{ title: "Resume review" }} />
        <ScreenHeader title="Resume review" />
        <View className="gap-4 px-6 pt-8">
          <Text className="text-body leading-6 text-muted-foreground">
            {run.status === "running"
              ? "Your resume is still being tailored."
              : "Generate a tailored preview to review your resume here. Previews aren’t kept in the app after it closes."}
          </Text>
          <Button
            onPress={() =>
              run.status === "running" ? router.replace("/tailoring/processing") : back()
            }
            className="h-12 rounded-xl"
          >
            <Text>{run.status === "running" ? "View progress" : "Go to Tailor CV"}</Text>
          </Button>
        </View>
      </AppScreen>
    );
  const warnings = Array.isArray(preview.warnings)
    ? preview.warnings.filter((value): value is string => typeof value === "string" && !!value)
    : [];
  const data = reviewItems(preview, tab);
  return (
    <AppScreen>
      <Stack.Screen options={{ title: "Review your resume" }} />
      <ScreenHeader
        title="Resume review"
        action={
          <Button
            variant="ghost"
            size="icon"
            onPress={back}
            accessibilityLabel="Back to Tailor CV"
            className="h-11 w-11 rounded-xl"
          >
            <LucideIcon name="X" size={20} className="text-foreground" />
          </Button>
        }
      />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReviewContent item={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-6 pb-8"
        ListHeaderComponent={
          <View className="mb-5 gap-5">
            <View className="gap-2">
              <Text className="text-h3 text-foreground">Your tailored preview is ready</Text>
              <Text className="text-body leading-6 text-muted-foreground">
                Review the wording, facts, and feedback. Nothing has been confirmed, and your
                original CV is unchanged.
              </Text>
            </View>
            <View className="flex-row items-center gap-2 rounded-xl bg-primary/5 px-3 py-3">
              <LucideIcon name="FileCheck" size={17} className="text-primary" />
              <Text className="text-caption flex-1 text-foreground" numberOfLines={2}>
                {run.input?.filename ?? "Your resume"} · Preview only
              </Text>
            </View>
            {warnings.map((warning, index) => (
              <Notice key={index} tone="info" message={warning} />
            ))}
            <View className="flex-row rounded-xl bg-secondary p-1">
              {tabs.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab === item.key }}
                  className={cn(
                    "h-10 flex-1 items-center justify-center rounded-lg",
                    tab === item.key && "border border-border bg-card",
                  )}
                >
                  <Text
                    className={cn(
                      "text-h6",
                      tab === item.key ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text className="text-body py-6 text-center leading-6 text-muted-foreground">
            {tab === "analysis"
              ? "No additional analysis was included in this preview."
              : tab === "changes"
                ? "No change details were included in this preview."
                : "No resume content was included."}
          </Text>
        }
        ListFooterComponent={
          <Button variant="outline" onPress={back} className="mt-3 h-12 rounded-xl">
            <Text>Back to Tailor CV</Text>
          </Button>
        }
      />
    </AppScreen>
  );
}
