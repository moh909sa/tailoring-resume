import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { Text } from "@/components/ui/text";
import { ThemeToggle } from "@/components/ThemeToggle";
import LucideIcon from "@/lib/icons/LucideIcon";

export default function HomeScreen() {
  return (
    <AppScreen>
      <View className="flex-row items-center justify-between px-6 py-3">
        <View className="flex-row items-center gap-2.5">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <LucideIcon
              name="Files"
              size={20}
              strokeWidth={1.8}
              className="text-primary-foreground"
            />
          </View>
          <Text className="text-h6 text-foreground">AI Resume Tailoring</Text>
        </View>
        <ThemeToggle />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-6 pb-8">
        <View className="mb-8 mt-7 gap-3">
          <Text
            accessibilityRole="header"
            className="text-h1 tracking-tight leading-[44px] text-foreground"
          >
            Your career,{"\n"}simplified.
          </Text>
          <Text className="text-body max-w-xs leading-6 text-muted-foreground">
            A little less admin.{"\n"}A little more possibility.
          </Text>
        </View>
        <Pressable
          onPress={() => router.navigate("/(tabs)/tailor")}
          accessibilityRole="button"
          accessibilityLabel="Tailor My CV"
          className="rounded-3xl bg-primary p-6 active:opacity-90 web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2"
        >
          <View className="mb-9 flex-row items-start justify-between">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <LucideIcon
                name="Sparkles"
                size={25}
                strokeWidth={1.7}
                className="text-primary-foreground"
              />
            </View>
            <View className="h-10 w-10 items-center justify-center rounded-full border border-primary-foreground/25">
              <LucideIcon name="ArrowUpRight" size={20} className="text-primary-foreground" />
            </View>
          </View>
          <Text className="text-h2 tracking-tight text-primary-foreground">Tailor My CV</Text>
          <Text className="text-body mt-2 max-w-xs leading-6 text-primary-foreground/80">
            Start with your CV and the role you want.
          </Text>
        </Pressable>
        <View className="mt-4 flex-row gap-4">
          <Pressable
            onPress={() => router.navigate("/(tabs)/library/my-cvs")}
            accessibilityRole="button"
            accessibilityLabel="My CVs. Upload and manage original resumes."
            className="min-h-48 flex-1 rounded-2xl border border-border bg-card p-5 active:bg-secondary"
          >
            <View className="mb-5 h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
              <LucideIcon name="FileText" size={22} strokeWidth={1.6} className="text-primary" />
            </View>
            <Text className="text-h4 text-foreground">My CVs</Text>
            <Text className="text-body mt-2 leading-5 text-muted-foreground">
              Upload and manage original resumes.
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.navigate("/(tabs)/library/tailored-cvs")}
            accessibilityRole="button"
            accessibilityLabel="Tailored CVs. View previously tailored resumes."
            className="min-h-48 flex-1 rounded-2xl border border-border bg-card p-5 active:bg-secondary"
          >
            <View className="mb-5 h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
              <LucideIcon name="FileCheck" size={22} strokeWidth={1.6} className="text-primary" />
            </View>
            <Text className="text-h4 text-foreground">Tailored CVs</Text>
            <Text className="text-body mt-2 leading-5 text-muted-foreground">
              View previously tailored resumes.
            </Text>
          </Pressable>
        </View>
        <View className="mt-7 flex-row items-center justify-center gap-2">
          <LucideIcon
            name="LockKeyhole"
            size={13}
            strokeWidth={1.7}
            className="text-muted-foreground"
          />
          <Text className="text-caption text-muted-foreground">
            Your experience. Your private workspace.
          </Text>
        </View>
      </ScrollView>
    </AppScreen>
  );
}
