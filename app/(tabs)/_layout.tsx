import { Tabs } from "expo-router";
import { useTheme } from "@/theming/ThemeProvider";
import LucideIcon from "@/lib/icons/LucideIcon";

export default function TabsLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarIconStyle: { height: 24 },
        tabBarLabelStyle: {
          fontFamily: theme.typography.h6?.fontFamily,
          fontSize: parseFloat(theme.typography.caption?.fontSize ?? "12"),
          lineHeight: 14,
          flexShrink: 0,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <LucideIcon name="House" size={23} color={color} strokeWidth={focused ? 2 : 1.6} />
          ),
        }}
      />
      <Tabs.Screen
        name="tailor"
        options={{
          title: "Tailor",
          tabBarIcon: ({ color, focused }) => (
            <LucideIcon name="Sparkles" size={23} color={color} strokeWidth={focused ? 2 : 1.6} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => (
            <LucideIcon name="FolderOpen" size={23} color={color} strokeWidth={focused ? 2 : 1.6} />
          ),
        }}
      />
    </Tabs>
  );
}
