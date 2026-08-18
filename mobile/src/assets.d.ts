declare module "*.svg" {
  const content: import("react").FC<import("react-native-svg").SvgProps>;
  export default content;
}

declare module "*.png" {
  const content: number;
  export default content;
}
