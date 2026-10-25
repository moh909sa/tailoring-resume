import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function LibrarySections({ selected }: { selected: "originals" | "tailored" }) {
  return (
    <View className="mx-6 mb-6 mt-2 flex-row rounded-xl bg-secondary p-1">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === "originals" }}
        onPress={() => router.navigate("/(tabs)/library/my-cvs")}
        className={cn(
          "h-10 flex-1 items-center justify-center rounded-lg",
          selected === "originals" && "border border-border bg-card",
        )}
      >
        <Text
          className={cn(
            "text-h6",
            selected === "originals" ? "text-primary" : "text-muted-foreground",
          )}
        >
          My CVs
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === "tailored" }}
        onPress={() => router.navigate("/(tabs)/library/tailored-cvs")}
        className={cn(
          "h-10 flex-1 items-center justify-center rounded-lg",
          selected === "tailored" && "border border-border bg-card",
        )}
      >
        <Text
          className={cn(
            "text-h6",
            selected === "tailored" ? "text-primary" : "text-muted-foreground",
          )}
        >
          Tailored CVs
        </Text>
      </Pressable>
    </View>
  );
}
