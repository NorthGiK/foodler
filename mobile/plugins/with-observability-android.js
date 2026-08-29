const fs = require("fs");
const path = require("path");
const {
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withProjectBuildGradle,
} = require("@expo/config-plugins");

const MARKER = "// Foodler observability";
const source = path.resolve(
  process.cwd(),
  "plugins/android/FoodlerObservabilityPackage.kt",
);

function appendOnce(contents, addition) {
  return contents.includes(MARKER)
    ? contents
    : `${contents}\n${MARKER}\n${addition}\n`;
}

module.exports = function withObservabilityAndroid(config) {
  config = withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = appendOnce(
      mod.modResults.contents,
      "allprojects { repositories { maven { url 'https://sdk.mytracker.ru/repo/' } } }",
    );
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (
      !mod.modResults.contents.includes('id "ru.ok.tracer" version "1.4.0"')
    ) {
      mod.modResults.contents = `plugins { id "ru.ok.tracer" version "1.4.0" }\n${mod.modResults.contents}`;
    }
    mod.modResults.contents = appendOnce(
      mod.modResults.contents,
      "dependencies {\n  implementation('com.my.tracker:mytracker-sdk:3.3.0')\n  implementation(platform('ru.ok.tracer:tracer-platform:1.4.0'))\n  implementation('ru.ok.tracer:tracer-crash-report')\n  implementation('ru.ok.tracer:tracer-crash-report-native')\n}\ntracer { create('defaultConfig') { pluginToken = System.getenv('TRACER_PLUGIN_TOKEN'); appToken = System.getenv('TRACER_APP_TOKEN'); uploadMapping = true; uploadNativeSymbols = true } }",
    );
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (!mod.modResults.contents.includes("FoodlerObservabilityPackage")) {
      mod.modResults.contents = mod.modResults.contents
        .replace(
          "import expo.modules.ExpoReactHostFactory",
          "import expo.modules.ExpoReactHostFactory\nimport com.foodler.observability.FoodlerObservabilityPackage\nimport ru.ok.tracer.configuration.HasTracerConfiguration\nimport ru.ok.tracer.configuration.TracerConfiguration\nimport ru.ok.tracer.crash.report.CrashFreeConfiguration\nimport ru.ok.tracer.crash.report.CrashReportConfiguration",
        )
        .replace(
          "class MainApplication : Application(), ReactApplication {",
          'class MainApplication : Application(), ReactApplication, HasTracerConfiguration {\n  override val tracerConfiguration: List<TracerConfiguration>\n    get() = if (getSharedPreferences("foodler_observability", 0).getBoolean("consent", false)) {\n      listOf(\n        CrashReportConfiguration.build { setSendAnr(true); setNativeEnabled(true) },\n        CrashFreeConfiguration.build { setEnabled(true) },\n      )\n    } else emptyList()',
        )
        .replace(
          "// add(MyReactNativePackage())",
          "add(FoodlerObservabilityPackage())",
        );
    }
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const javaDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
      );
      const destination = path.join(
        javaDir,
        "com",
        "foodler",
        "observability",
        "FoodlerObservabilityPackage.kt",
      );
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      return mod;
    },
  ]);
};
