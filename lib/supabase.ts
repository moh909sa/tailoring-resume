import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const authConfigurationError =
  !url || !key
    ? "Sign-in is not configured yet. Please contact support."
    : !key.startsWith("sb_publishable_")
      ? "Sign-in requires a Supabase publishable key. Please contact support."
      : null;

export const supabase =
  url && key && !authConfigurationError
    ? createClient(url, key, {
        auth: {
          ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
