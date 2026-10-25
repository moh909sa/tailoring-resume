import { Theme } from "../Theme";

const darkTheme: Theme = {
  name: "dark",
  colors: {
    background: "hsl(240 10% 3.9%)",
    foreground: "hsl(0 0% 98%)",
    card: "hsl(240 6% 8%)",
    cardForeground: "hsl(0 0% 98%)",
    popover: "hsl(240 10% 3.9%)",
    popoverForeground: "hsl(0 0% 98%)",
    primary: "hsl(247 100% 64%)",
    primaryForeground: "hsl(0 0% 98%)",
    secondary: "hsl(240 3.7% 15.9%)",
    secondaryForeground: "hsl(0 0% 98%)",
    tertiary: "hsl(214 100% 57.1%)",
    tertiaryForeground: "hsl(0 0% 98%)",
    muted: "hsl(240 3.7% 15.9%)",
    mutedForeground: "hsl(240 5% 64.9%)",
    accent: "hsl(240 3.7% 15.9%)",
    accentForeground: "hsl(0 0% 98%)",
    success: "hsl(142 70.6% 45.3%)",
    successForeground: "hsl(0 0% 98%)",
    warning: "hsl(45 100% 51%)",
    warningForeground: "hsl(0 0% 98%)",
    destructive: "hsl(0 72% 51%)",
    destructiveForeground: "hsl(0 0% 98%)",
    border: "hsl(240 3.7% 15.9%)",
    notification: "hsl(240 3.7% 15.9%)",
    input: "hsl(240 3.7% 15.9%)",
    ring: "hsl(247 100% 64%)",
    overlay: "hsl(0 0% 100%)",
  },
  typography: {
    h1: {
      fontSize: "36px",
      fontFamily: "Inter_700Bold",
    },
    h2: {
      fontSize: "24px",
      fontFamily: "Inter_700Bold",
    },
    h3: {
      fontSize: "20px",
      fontFamily: "Inter_600SemiBold",
    },
    h4: {
      fontSize: "18px",
      fontFamily: "Inter_600SemiBold",
    },
    h5: {
      fontSize: "16px",
      fontFamily: "Inter_500Medium",
    },
    h6: {
      fontSize: "14px",
      fontFamily: "Inter_500Medium",
    },
    body: {
      fontSize: "15px",
      fontFamily: "Inter_400Regular",
    },
    caption: {
      fontSize: "12px",
      fontFamily: "Inter_400Regular",
    },
    button: {
      fontSize: "16px",
      fontFamily: "Inter_500Medium",
    },
  },
};

export default darkTheme;
