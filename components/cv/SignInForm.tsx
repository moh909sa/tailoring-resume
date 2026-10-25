import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Notice } from "@/components/cv/Notice";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theming/ThemeProvider";
import type { CvNotice } from "@/lib/cv/types";

export function SignInForm({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<CvNotice | null>(null);

  async function submit() {
    if (submitting || !supabase) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNotice({ tone: "error", message: "Enter a valid email address." });
      return;
    }
    if (!password || (creating && password.length < 8)) {
      setNotice({
        tone: "error",
        message: creating ? "Use a password with at least 8 characters." : "Enter your password.",
      });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } = creating
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      setPassword("");
      if (data.session) onClose();
      else if (creating) {
        setCreating(false);
        setNotice({
          tone: "info",
          message: "Check your email to confirm your account, then come back here to sign in.",
        });
      } else throw new Error("Sign-in did not return a session. Please try again.");
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Sign-in could not be completed. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4 rounded-2xl border border-border bg-card p-5">
      <Text className="text-h4 text-foreground">
        {creating ? "Create your account" : "Sign in to your account"}
      </Text>
      <Text className="text-body leading-5 text-muted-foreground">
        Your CVs are linked to your account.
      </Text>
      <View className="gap-2">
        <Text className="text-h6 text-foreground">Email</Text>
        <Input
          accessibilityLabel="Email address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          editable={!submitting}
          className="h-12 rounded-xl"
        />
      </View>
      <View className="gap-2">
        <Text className="text-h6 text-foreground">Password</Text>
        <Input
          accessibilityLabel="Password"
          placeholder={creating ? "At least 8 characters" : "Your password"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={creating ? "new-password" : "current-password"}
          textContentType={creating ? "newPassword" : "password"}
          editable={!submitting}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          className="h-12 rounded-xl"
        />
      </View>
      {notice ? <Notice {...notice} /> : null}
      <Button
        onPress={() => void submit()}
        disabled={submitting || !supabase}
        className="h-12 gap-2 rounded-xl"
      >
        {submitting ? (
          <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
        ) : null}
        <Text>{submitting ? "Please wait…" : creating ? "Create account" : "Sign in"}</Text>
      </Button>
      <View className="flex-row items-center justify-between">
        <Pressable
          disabled={submitting}
          accessibilityRole="button"
          onPress={() => {
            setCreating(!creating);
            setNotice(null);
          }}
          className="py-3"
        >
          <Text className="text-h6 text-primary">
            {creating ? "Already have an account?" : "Create an account"}
          </Text>
        </Pressable>
        <Pressable
          disabled={submitting}
          accessibilityRole="button"
          onPress={onClose}
          className="py-3"
        >
          <Text className="text-body text-muted-foreground">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
