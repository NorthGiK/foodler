const path = require("path");

const buildChannel = process.env.EXPO_PUBLIC_BUILD_CHANNEL ?? "development";
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

module.exports = {
  expo: {
    name: "Foodler",
    slug: "foodler",
    scheme: "foodler",
    version: "3.1.0",
    orientation: "portrait",
    platforms: ["android"],
    userInterfaceStyle: "automatic",
    icon: "./assets/FoodlerIcon.png",
    android: {
      versionCode: 11,
      package: "com.Foodler.chih_pih",
      permissions: ["android.permission.CAMERA"],
      ...(googleServicesFile
        ? { googleServicesFile: path.resolve(googleServicesFile) }
        : {}),
    },
    plugins: [
      "expo-camera",
      "expo-sqlite",
      "expo-font",
      "@react-native-vector-icons/material-icons",
      "@react-native-firebase/app",
      "@react-native-firebase/analytics",
      "@react-native-firebase/crashlytics",
      [
        "expo-build-properties",
        { android: { enableProguardInReleaseBuilds: true } },
      ],
      ["expo-image-picker", { microphonePermission: false }],
    ],
    extra: {
      buildChannel,
      eas: { projectId: "3ee9bd6b-0d28-40da-bcf9-cbce20899eb2" },
    },
  },
};
