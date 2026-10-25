import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { LibrarySections } from "@/components/library/LibrarySections";
import { DocumentEmptyState } from "@/components/cv/DocumentEmptyState";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export default function TailoredCvsScreen() {
  return (
    <AppScreen>
      <ScreenHeader title="Tailored CVs" />
      <LibrarySections selected="tailored" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-6 pb-8">
        <Text className="text-body mb-3 leading-6 text-muted-foreground">
          A library for the roles you're moving toward.
        </Text>
        <DocumentEmptyState
          icon="FileCheck"
          title="No tailored CVs yet"
          description="When AI tailoring is available, the resumes you create for specific roles will appear here."
          action={
            <Button
              variant="outline"
              onPress={() => router.navigate("/(tabs)/tailor")}
              className="h-12 gap-2 rounded-xl px-7"
            >
              <Text>Go to Tailor</Text>
            </Button>
          }
        />
        <View className="items-center pt-3">
          <Text className="text-caption text-muted-foreground">AI tailoring is coming soon.</Text>
        </View>
      </ScrollView>
    </AppScreen>
  );
}
