import { useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CvSelectionSheet } from "@/components/cv/CvSelectionSheet";
import { Notice } from "@/components/cv/Notice";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useMyCv } from "@/lib/cv/useMyCv";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theming/ThemeProvider";
import { cn } from "@/lib/utils";

export default function TailorScreen() {
  const { session, loading: authLoading, error: authError } = useAuth();
  const { theme } = useTheme();
  const cv = useMyCv();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [mode, setMode] = useState<"description" | "url">("description");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const ownerId = session?.user?.id ?? null;
  const selected = cv.resumes.find((item) => item.id === selectedId);
  useEffect(() => {
    setSelectedId(null);
    setDescription("");
    setUrl("");
    setChoosing(false);
  }, [ownerId]);
  useEffect(() => {
    if (!cv.loading && !cv.listError && selectedId && !selected) setSelectedId(null);
  }, [cv.loading, cv.listError, selectedId, selected]);

  function goToMyCvs() {
    setChoosing(false);
    router.navigate("/(tabs)/library/my-cvs");
  }

  return (
    <AppScreen>
      <ScreenHeader title="Tailor CV" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-6 pb-8 pt-3"
        >
          <Text className="text-body mb-8 leading-6 text-muted-foreground">
            Bring your experience and your next opportunity together.
          </Text>
          <View className="mb-8 gap-3">
            <Text className="text-h4 text-foreground">Your CV</Text>
            <Pressable
              onPress={() => setChoosing(true)}
              disabled={authLoading}
              accessibilityRole="button"
              accessibilityLabel="Choose an uploaded CV"
              className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-secondary"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/5">
                {cv.loading || authLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <LucideIcon name="FileText" size={22} className="text-primary" />
                )}
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-h5 text-foreground" numberOfLines={2}>
                  {selected?.original_filename ?? "Choose a CV"}
                </Text>
                <Text className="text-caption text-muted-foreground">
                  {selected
                    ? "Original resume from your library"
                    : "Select an original from My CVs"}
                </Text>
              </View>
              <LucideIcon name="ChevronDown" size={18} className="text-muted-foreground" />
            </Pressable>
            {authError ? <Notice tone="error" message={authError} /> : null}
            {cv.listError ? (
              <View className="gap-3">
                <Notice tone="error" message={cv.listError} />
                <Button
                  variant="outline"
                  onPress={() => void cv.refresh()}
                  disabled={cv.refreshing}
                  className="self-start rounded-xl"
                >
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : null}
            <Pressable onPress={goToMyCvs} accessibilityRole="button" className="self-start py-2">
              <Text className="text-h6 text-primary">
                {ownerId ? "Upload another CV" : "Sign in and upload a CV"}
              </Text>
            </Pressable>
          </View>
          <View className="gap-3">
            <Text className="text-h4 text-foreground">The opportunity</Text>
            <View className="mb-1 flex-row rounded-xl bg-secondary p-1">
              <Pressable
                onPress={() => setMode("description")}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === "description" }}
                className={cn(
                  "h-10 flex-1 items-center justify-center rounded-lg",
                  mode === "description" && "border border-border bg-card",
                )}
              >
                <Text
                  className={cn(
                    "text-h6",
                    mode === "description" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  Job description
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("url")}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === "url" }}
                className={cn(
                  "h-10 flex-1 items-center justify-center rounded-lg",
                  mode === "url" && "border border-border bg-card",
                )}
              >
                <Text
                  className={cn(
                    "text-h6",
                    mode === "url" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  Job URL
                </Text>
              </Pressable>
            </View>
            {mode === "description" ? (
              <Textarea
                accessibilityLabel="Job description"
                value={description}
                onChangeText={setDescription}
                placeholder="Paste the job description, including responsibilities and requirements…"
                numberOfLines={8}
                className="min-h-56 rounded-2xl p-4 leading-6"
              />
            ) : (
              <View className="gap-2">
                <Input
                  accessibilityLabel="Job posting URL"
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://company.com/careers/role"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="h-14 rounded-2xl px-4"
                />
                <Text className="text-caption leading-5 text-muted-foreground">
                  Paste the full link to the job posting.
                </Text>
              </View>
            )}
          </View>
          <View className="mt-8 gap-3">
            <Button
              disabled
              accessibilityLabel="Tailor My CV. Coming soon."
              className="h-14 gap-2 rounded-2xl"
            >
              <LucideIcon name="Sparkles" size={19} className="text-primary-foreground" />
              <Text>Tailor My CV</Text>
            </Button>
            <Text className="text-caption text-center leading-5 text-muted-foreground">
              AI tailoring is coming soon.{"\n"}No tailored documents are created yet.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <CvSelectionSheet
        visible={choosing}
        resumes={cv.resumes}
        selectedId={selectedId}
        loading={cv.loading || authLoading}
        error={authError ?? cv.listError}
        onClose={() => setChoosing(false)}
        onSelect={(id) => {
          setSelectedId(id);
          setChoosing(false);
        }}
        onUpload={goToMyCvs}
        onRefresh={() => void cv.refresh()}
      />
    </AppScreen>
  );
}
