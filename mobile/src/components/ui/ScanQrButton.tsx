import { Pressable, View, Text, StyleSheet, Image } from "react-native";
import { useTheme } from "../ThemeContext";
import TomatoIconDark from "@/assets/TomatoOutline.svg";
import TomatoIconLight from "@/assets/TomatoOutlineLight.png";

export type Props = {
  onPress?: () => void | undefined | null;
};

export default function ScanQrButton({ onPress }: Props) {
  const { theme, themeName } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Загрузить QR"
      onPress={onPress}
      style={({ pressed }) => [
        styles.uploadCard,
        {
          borderColor: theme.primary,
          backgroundColor: theme.primary,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View>
        {themeName !== "dark" ? (
          <Image source={TomatoIconLight} style={{ width: 39, height: 39 }} />
        ) : (
          <TomatoIconDark width={39} height={39} />
        )}
      </View>
      <View style={styles.uploadCopy}>
        <Text
          numberOfLines={1}
          style={[styles.uploadTitle, { color: theme.white }]}
        >
          Загрузить QR
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.uploadSubtitle, { color: theme.white }]}
        >
          Фото чека — и покупки уже в учёте
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  uploadCard: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    marginBottom: 17,
    marginTop: 34,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  uploadSubtitle: { fontSize: 14, marginTop: 4, opacity: 0.84 },
  uploadCopy: { flex: 1, minWidth: 0 },
  uploadTitle: { fontSize: 19, fontWeight: "700" },
});
