const { getDefaultConfig } = require("expo/metro-config");
const ReactNativeSvgTransformer = require.resolve("react-native-svg-transformer");

module.exports = (() => {
    const defaultConfig = getDefaultConfig(__dirname);

    defaultConfig.transformer.babelTransformerPath = ReactNativeSvgTransformer;

    defaultConfig.resolver.assetExts = defaultConfig.resolver.assetExts.filter(ext => ext !== "svg");
    defaultConfig.resolver.sourceExts = [...defaultConfig.resolver.sourceExts, "svg"];

    return defaultConfig;
})();