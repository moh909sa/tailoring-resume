import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { AppSheet } from "@/components/layout/AppSheet";
import { SignInForm } from "@/components/cv/SignInForm";
import LucideIcon from "@/lib/icons/LucideIcon";

export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <AppSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row justify-end px-5 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sign-in"
            onPress={onClose}
            className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <LucideIcon name="X" size={20} className="text-foreground" />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pb-8 pt-4">
          {visible ? <SignInForm onClose={onClose} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppSheet>
  );
}
