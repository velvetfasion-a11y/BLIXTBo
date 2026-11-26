import type { ExpoConfig } from "expo/config";

const privacyManifests = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [] as string[],
  NSPrivacyCollectedDataTypes: [
    "NSPrivacyCollectedDataTypeEmailAddress",
    "NSPrivacyCollectedDataTypeName",
    "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypeDeviceID",
    "NSPrivacyCollectedDataTypePurchaseHistory",
    "NSPrivacyCollectedDataTypeProductInteraction",
    "NSPrivacyCollectedDataTypeOtherUserContent",
  ].map((type) => ({
    NSPrivacyCollectedDataType: type,
    NSPrivacyCollectedDataTypeLinked: true,
    NSPrivacyCollectedDataTypeTracking: false,
    NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
  })),
  NSPrivacyAccessedAPITypes: [
    { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
    { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
    { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace", NSPrivacyAccessedAPITypeReasons: ["E174.1"] },
    { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime", NSPrivacyAccessedAPITypeReasons: ["35F9.1"] },
  ],
};

const config: ExpoConfig = {
  name: "Blixtbo",
  slug: "blixtbo",
  scheme: "blixtbo",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "se.blixtbo.app",
    buildNumber: "1",
    supportsTablet: false,
    icon: "./assets/icon.png",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleDevelopmentRegion: "sv",
      CFBundleAllowMixedLocalizations: true,
    },
    privacyManifests,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F3F0EA",
        image: "./assets/splash.png",
        resizeMode: "contain",
        imageWidth: 180,
      },
    ],
    ["expo-notifications", { mode: "production" }],
    "expo-iap",
  ],
  experiments: {
    typedRoutes: false,
  },
};

export default config;
