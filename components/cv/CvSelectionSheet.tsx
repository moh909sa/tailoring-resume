import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { AppSheet } from "@/components/layout/AppSheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { CvRow } from "@/components/cv/CvRow";
import { DocumentEmptyState } from "@/components/cv/DocumentEmptyState";
import { Notice } from "@/components/cv/Notice";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useTheme } from "@/theming/ThemeProvider";
import type { Resume } from "@/lib/cv/types";

export function CvSelectionSheet({
  visible,
  resumes,
  selectedId,
  loading,
  error,
  onClose,
  onSelect,
  onUpload,
  onRefresh,
}: {
  visible: boolean;
  resumes: Resume[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onRefresh: () => void;
}) {
  const { theme } = useTheme();
  return (
    <AppSheet visible={visible} onClose={onClose}>
      <ScreenHeader
        title="Choose a CV"
        action={
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close CV selection"
            className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <LucideIcon name="X" size={20} className="text-foreground" />
          </Pressable>
        }
      />
      <FlatList
        data={resumes}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-6 pb-8 pt-4"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id)}
            accessibilityRole="button"
            accessibilityLabel={"Choose " + item.original_filename}
            accessibilityState={{ selected: selectedId === item.id }}
            className="active:opacity-70"
          >
            <CvRow resume={item} selected={selectedId === item.id} />
          </Pressable>
        )}
        ListHeaderComponent={
          error ? (
            <View className="mb-5 gap-3">
              <Notice tone="error" message={error} />
              <Button variant="outline" onPress={onRefresh}>
                <Text>Try again</Text>
              </Button>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center gap-3 py-12">
              <ActivityIndicator color={theme.colors.primary} />
              <Text className="text-body text-muted-foreground">Loading your CVs…</Text>
            </View>
          ) : !error ? (
            <DocumentEmptyState
              title="Start with your original CV"
              description="Upload a CV to your library, then come back here to choose it."
              action={
                <Button onPress={onUpload} className="h-12 rounded-xl">
                  <Text>Go to My CVs</Text>
                </Button>
              }
            />
          ) : null
        }
      />
    </AppSheet>
  );
}
