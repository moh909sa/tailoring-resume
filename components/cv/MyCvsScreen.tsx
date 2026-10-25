import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { LibrarySections } from "@/components/library/LibrarySections";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { CvRow } from "@/components/cv/CvRow";
import { Notice } from "@/components/cv/Notice";
import { DocumentEmptyState } from "@/components/cv/DocumentEmptyState";
import { AccountSheet } from "@/components/cv/AccountSheet";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMyCv } from "@/lib/cv/useMyCv";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theming/ThemeProvider";

export default function MyCvsScreen() {
  const { theme } = useTheme();
  const { session, loading: authLoading, error: authError } = useAuth();
  const cv = useMyCv();
  const [showSignIn, setShowSignIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signedIn = !!session?.user?.id;
  const busy = cv.picking || !!cv.uploadProgress;

  function chooseFile() {
    if (!signedIn) {
      setShowSignIn(true);
      return;
    }
    void cv.upload();
  }

  async function signOut() {
    if (!supabase || signingOut || busy) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setShowSignIn(false);
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader
        title="My CVs"
        action={
          <Button
            onPress={chooseFile}
            disabled={busy || authLoading || !!authError || signingOut}
            accessibilityLabel="Upload CV. Choose a PDF or DOCX file, up to 4 megabytes."
            className="h-11 gap-2 rounded-xl px-4"
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
            ) : (
              <LucideIcon name="Upload" size={16} className="text-primary-foreground" />
            )}
            <Text>{busy ? "Please wait…" : "Upload CV"}</Text>
          </Button>
        }
      />
      <LibrarySections selected="originals" />
      <FlatList
        data={cv.resumes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CvRow resume={item} />}
        contentContainerClassName="px-6 pb-8"
        showsVerticalScrollIndicator={false}
        refreshing={signedIn && cv.refreshing}
        onRefresh={signedIn ? () => void cv.refresh() : undefined}
        ListHeaderComponent={
          <View className="mb-5 gap-4">
            <View className="gap-1">
              <Text className="text-body text-muted-foreground">
                Your original resumes, safely kept together.
              </Text>
              <Text className="text-caption text-muted-foreground">PDF or DOCX · Up to 4 MB</Text>
            </View>
            {cv.uploadProgress ? (
              <View
                accessibilityLiveRegion="polite"
                className="flex-row items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4"
              >
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <View className="flex-1 gap-1">
                  <Text className="text-h6 text-foreground">
                    {cv.uploadProgress.phase === "processing"
                      ? "Processing your CV"
                      : cv.uploadProgress.percent === null
                        ? "Uploading your CV"
                        : "Uploading " + cv.uploadProgress.percent + "%"}
                  </Text>
                  <Text className="text-caption leading-5 text-muted-foreground">
                    {cv.uploadProgress.phase === "processing"
                      ? "Your file has been sent. Processing may take a few minutes."
                      : "Keep the app open while your file uploads."}
                  </Text>
                </View>
              </View>
            ) : null}
            {cv.notice ? <Notice {...cv.notice} onDismiss={cv.dismissNotice} /> : null}
            {authError ? <Notice tone="error" message={authError} /> : null}
            {signOutError ? <Notice tone="error" message={signOutError} /> : null}
            {cv.listError ? (
              <View className="gap-3">
                <Notice tone="error" message={cv.listError} />
                <Button
                  variant="outline"
                  onPress={() => void cv.refresh()}
                  disabled={cv.refreshing}
                  className="h-11 self-start rounded-xl"
                >
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          authLoading || cv.loading ? (
            <View className="items-center gap-3 py-12">
              <ActivityIndicator color={theme.colors.primary} />
              <Text className="text-body text-muted-foreground">
                {authLoading ? "Restoring your account…" : "Loading your CVs…"}
              </Text>
            </View>
          ) : !cv.listError && !authError ? (
            <DocumentEmptyState
              title={signedIn ? "Your first CV starts here" : "Your CVs, in one place"}
              description={
                signedIn
                  ? "Upload your original resume. It will be here whenever you need it."
                  : "Sign in to upload and keep your original resumes in your private library."
              }
              action={
                !signedIn ? (
                  <Button onPress={() => setShowSignIn(true)} className="h-12 rounded-xl px-8">
                    <Text>Sign in</Text>
                  </Button>
                ) : undefined
              }
            />
          ) : null
        }
        ListFooterComponent={
          signedIn ? (
            <View className="mt-6 items-center gap-1">
              <View className="flex-row items-center gap-1.5">
                <LucideIcon name="LockKeyhole" size={12} className="text-muted-foreground" />
                <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                  {session?.user?.email ?? "Your private library"}
                </Text>
              </View>
              <Pressable
                onPress={() => void signOut()}
                disabled={busy || signingOut}
                accessibilityRole="button"
                className="px-5 py-3"
              >
                <Text className="text-caption text-muted-foreground">
                  {signingOut ? "Signing out…" : "Sign out"}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />
      <AccountSheet visible={showSignIn} onClose={() => setShowSignIn(false)} />
    </AppScreen>
  );
}
