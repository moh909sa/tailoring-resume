module.exports = {
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    package: "com.draftbitbuildservices.newapp"
  },
  assetBundlePatterns: ["**/*"],
  experiments: { typedRoutes: true, tsconfigPaths: true },
  icon: "./assets/images/icon.png",
  ios: { supportsTablet: true },
  name: "AI Resume Tailoring",
  orientation: "portrait",
  plugins: [
  "expo-font",
  "expo-document-picker",
  "expo-asset",
  "expo-video",
  "expo-web-browser",
  "expo-image",

  [
  "expo-router",
  {


  }]],




  scheme: "new-app",
  slug: "new-app",
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  userInterfaceStyle: "automatic",
  version: "1.0.0",
  web: { bundler: "metro", output: "single", favicon: "./assets/images/favicon.png" },
  platforms: ["ios", "android", "web"]
};
