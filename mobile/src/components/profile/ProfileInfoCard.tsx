import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";
import { UserProfile } from "../../types";
import { Dimensions } from "react-native";

const { width } = Dimensions.get("window");

interface ProfileInfoCardProps {
  profile: UserProfile;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onProfileChange: (profile: UserProfile) => void;
}

export function ProfileInfoCard({
  profile,
  editing,
  onEdit,
  onCancel,
  onSave,
  onProfileChange,
}: ProfileInfoCardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Личная информация
        </Text>
        {!editing ? (
          <AnimatedPressable scaleTo={0.9} onPress={onEdit}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Изменить личную информацию"
              style={[
                styles.actionButton,
                { backgroundColor: theme.primaryContainer },
              ]}
            >
              <MaterialIcons
                name="edit"
                size={20}
                color={theme.onPrimaryContainer}
              />
            </View>
          </AnimatedPressable>
        ) : (
          <View style={styles.headerActions}>
            <AnimatedPressable
              scaleTo={0.9}
              onPress={onCancel}
              accessibilityLabel="Отменить редактирование личной информации"
            >
              <View
                style={[
                  styles.actionButton,
                  { backgroundColor: theme.surfaceElevated },
                ]}
              >
                <MaterialIcons name="close" size={20} color={theme.muted} />
              </View>
            </AnimatedPressable>
            <AnimatedPressable
              scaleTo={0.9}
              onPress={onSave}
              accessibilityLabel="Сохранить личную информацию"
            >
              <View
                style={[
                  styles.actionButton,
                  { backgroundColor: theme.primaryContainer },
                ]}
              >
                <MaterialIcons
                  name="check"
                  size={20}
                  color={theme.onPrimaryContainer}
                />
              </View>
            </AnimatedPressable>
          </View>
        )}
      </View>

      {editing ? (
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Имя</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.outline,
                  backgroundColor: theme.surfaceElevated,
                },
              ]}
              value={profile.name}
              onChangeText={(text: string) =>
                onProfileChange({ ...profile, name: text })
              }
              placeholder="Ваше имя"
              placeholderTextColor={theme.muted}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.text }]}>Возраст</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.outline,
                    backgroundColor: theme.surfaceElevated,
                  },
                ]}
                value={profile.age.toString()}
                onChangeText={(text: string) =>
                  onProfileChange({ ...profile, age: parseInt(text) || 0 })
                }
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={theme.muted}
              />
            </View>

            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.text }]}>Пол</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Изменить пол"
                style={[
                  styles.input,
                  {
                    borderColor: theme.outline,
                    backgroundColor: theme.surfaceElevated,
                  },
                ]}
                onPress={() => {
                  onProfileChange({
                    ...profile,
                    gender: profile.gender === "male" ? "female" : "male",
                  });
                }}
              >
                <Text style={{ color: theme.text }}>
                  {profile.gender === "male" ? "Мужской" : "Женский"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.text }]}>
                Рост (см)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.outline,
                    backgroundColor: theme.surfaceElevated,
                  },
                ]}
                value={profile.heightCm.toString()}
                onChangeText={(text: string) =>
                  onProfileChange({ ...profile, heightCm: parseInt(text) || 0 })
                }
                keyboardType="number-pad"
                placeholder="170"
                placeholderTextColor={theme.muted}
              />
            </View>

            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.text }]}>
                Вес (кг)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.outline,
                    backgroundColor: theme.surfaceElevated,
                  },
                ]}
                value={profile.weightKg.toString()}
                onChangeText={(text: string) =>
                  onProfileChange({ ...profile, weightKg: parseInt(text) || 0 })
                }
                keyboardType="number-pad"
                placeholder="70"
                placeholderTextColor={theme.muted}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>
              Дополнительная информация
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  color: theme.text,
                  borderColor: theme.outline,
                  backgroundColor: theme.surfaceElevated,
                },
              ]}
              value={profile.additionalInfo || ""}
              onChangeText={(text: string) =>
                onProfileChange({ ...profile, additionalInfo: text })
              }
              placeholder="Аллергии, особенности здоровья, диета..."
              placeholderTextColor={theme.muted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>
      ) : (
        <View style={styles.infoList}>
          {profile.name ? (
            <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
              <MaterialIcons name="person" size={18} color={theme.muted} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: theme.muted }]}>
                  Имя
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {profile.name}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
            <MaterialIcons name="cake" size={18} color={theme.muted} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.muted }]}>
                Возраст
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {profile.age} лет
              </Text>
            </View>
          </View>

          <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
            <MaterialIcons name="wc" size={18} color={theme.muted} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.muted }]}>
                Пол
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {profile.gender === "male" ? "Мужской" : "Женский"}
              </Text>
            </View>
          </View>

          <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
            <MaterialIcons name="straighten" size={18} color={theme.muted} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.muted }]}>
                Рост
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {profile.heightCm} см
              </Text>
            </View>
          </View>

          <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
            <MaterialIcons
              name="fitness-center"
              size={18}
              color={theme.muted}
            />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.muted }]}>
                Вес
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {profile.weightKg} кг
              </Text>
            </View>
          </View>

          {profile.additionalInfo ? (
            <View style={styles.infoRow}>
              <MaterialIcons name="info" size={18} color={theme.muted} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: theme.muted }]}>
                  Дополнительно
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {profile.additionalInfo}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: (width - 16*2 - 18*2) * 0.8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 23,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "column",
    gap: 8,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  form: {
    width: "100%",
    gap: 12,
  },
  field: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
  },
  infoList: {
    width: "100%",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 21,
  },
});
