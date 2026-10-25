import { Stack } from "expo-router";

export default function LibraryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="index" options={{ title: "Library" }} />
      <Stack.Screen name="my-cvs" options={{ title: "My CVs" }} />
      <Stack.Screen name="tailored-cvs" options={{ title: "Tailored CVs" }} />
    </Stack>
  );
}
