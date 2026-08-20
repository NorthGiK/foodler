import { View, Text, StyleSheet, Image } from "react-native";
import { useTheme } from "../ThemeContext";
import TomatoIconDark from "@/assets/TomatoOutline.svg";
import TomatoIconLight from "@/assets/TomatoOutlineLight.png";
import { AnimatedPressable } from "../animations";
import { Theme } from "@/themes";

export type Props = {
  onPress?: () => void | undefined | null;
};

export default function ScanQrButton({ onPress }: Props) {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Загрузить QR"
      onPress={onPress}
      style={({ pressed }) => [
        styles.uploadCard,
        {
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View>
        <Image source={TomatoIconLight} style={{ width: 39, height: 39 }} />
      </View>
      <View style={styles.uploadCopy}>
        <Text
          numberOfLines={1}
          style={styles.uploadTitle}
        >
          Загрузить QR
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  uploadCard: {
    backgroundColor: theme.danger,
    alignItems: "center",
    borderRadius: 34,
    flexDirection: "row",
    gap: 16,
    marginBottom: 17,
    marginTop: 34,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  uploadCopy: { flex: 1, minWidth: 0 },
  uploadTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: theme.white,
  },
});
