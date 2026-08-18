import React from "react";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";
import { FamilyMember, UserProfile } from "../../types";
import { CashFormInput, CashFormSection, FamilyMemberCard } from "../ui";
import FullModalWindow from "../FullModalWindow";

interface FamilySectionProps {
  profile: UserProfile;
  onAddMember: (member: FamilyMember) => Promise<boolean>;
  onUpdateMember: (index: number, member: FamilyMember) => Promise<boolean>;
  onRemoveMember: (index: number) => void;
}

export function FamilySection({
  profile,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}: FamilySectionProps) {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = React.useState(false);
  const [newMember, setNewMember] = React.useState<FamilyMember>({
    name: "",
    age: 0,
    gender: "male",
    heightCm: 0,
    weightKg: 0,
    dietaryPreferences: [],
    healthGoals: [],
  });
  const [memberError, setMemberError] = React.useState("");
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  const resetMember = () => {
    setNewMember({
      name: "",
      age: 0,
      gender: "male",
      heightCm: 0,
      weightKg: 0,
      dietaryPreferences: [],
      healthGoals: [],
    });
  };

  const handleAdd = async () => {
    if (!newMember.name.trim()) {
      setMemberError("Введите имя члена семьи");
      return;
    }
    const saved =
      editingIndex === null
        ? await onAddMember(newMember)
        : await onUpdateMember(editingIndex, newMember);
    if (!saved) return;
    resetMember();
    setMemberError("");
    setEditingIndex(null);
    setModalVisible(false);
  };

  return (
    <>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.headingCopy}>
            <Text style={[styles.eyebrow, { color: theme.secondary }]}>
              СЕМЬЯ
            </Text>
            <Text style={[styles.sectionTitle, { color: theme.secondary }]}>
              Члены семьи
            </Text>
          </View>
          <View
            style={[
              styles.headingIcon,
              { backgroundColor: theme.primaryContainer },
            ]}
          >
            <MaterialIcons
              name="groups-2"
              size={22}
              color={theme.onPrimaryContainer}
            />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить члена семьи"
          onPress={() => {
            setEditingIndex(null);
            resetMember();
            setMemberError("");
            setModalVisible(true);
          }}
          style={({ pressed }) => [
            styles.addMemberButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.addMemberIcon,
              { backgroundColor: theme.primary + "18" },
            ]}
          >
            <MaterialIcons name="person-add" size={21} color={theme.primary} />
          </View>
          <Text style={[styles.addMemberText, { color: theme.text }]}>
            Добавить члена семьи
          </Text>
          <MaterialIcons name="chevron-right" size={23} color={theme.muted} />
        </Pressable>

        {profile.familyMembers.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Нет добавленных членов семьи
          </Text>
        ) : (
          <View style={styles.familyList}>
            {profile.familyMembers.map((member, index) => (
              <View key={index} style={{ marginBottom: 10 }}>
                <FamilyMemberCard
                  member={member}
                  onEdit={() => {
                    setEditingIndex(index);
                    setNewMember(member);
                    setMemberError("");
                    setModalVisible(true);
                  }}
                  onDelete={() => onRemoveMember(index)}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Add Member Modal */}
      <FullModalWindow visible={modalVisible} setVisible={setModalVisible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoiding}
        >
          <View
            style={[
              styles.modal,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalBadge,
                  { backgroundColor: theme.primaryContainer },
                ]}
              >
                <MaterialIcons
                  name="person-add"
                  size={21}
                  color={theme.onPrimaryContainer}
                />
              </View>
              <Text style={[styles.modalTitle, { color: theme.secondary }]}>
                {editingIndex === null
                  ? "Добавить члена семьи"
                  : "Изменить члена семьи"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть форму члена семьи"
                onPress={() => setModalVisible(false)}
                hitSlop={10}
              >
                <MaterialIcons name="close" size={23} color={theme.muted} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <CashFormSection title="Основное">
                <CashFormInput
                  label="Имя"
                  value={newMember.name}
                  onChangeText={(text: string) => {
                    setNewMember({ ...newMember, name: text });
                    if (memberError) setMemberError("");
                  }}
                  placeholder="Введите имя"
                  error={memberError}
                />
              </CashFormSection>

              <CashFormSection title="Физические данные">
                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Возраст
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
                      value={newMember.age.toString()}
                      onChangeText={(text: string) =>
                        setNewMember({ ...newMember, age: parseInt(text) || 0 })
                      }
                      keyboardType="number-pad"
                      placeholder="30"
                      placeholderTextColor={theme.muted}
                    />
                  </View>

                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Пол
                    </Text>
                    <Pressable
                      style={[
                        styles.input,
                        {
                          borderColor: theme.outline,
                          backgroundColor: theme.surfaceElevated,
                        },
                      ]}
                      onPress={() =>
                        setNewMember({
                          ...newMember,
                          gender:
                            newMember.gender === "male" ? "female" : "male",
                        })
                      }
                    >
                      <Text style={{ color: theme.text }}>
                        {newMember.gender === "male" ? "Мужской" : "Женский"}
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
                      value={newMember.heightCm.toString()}
                      onChangeText={(text: string) =>
                        setNewMember({
                          ...newMember,
                          heightCm: parseInt(text) || 0,
                        })
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
                      value={newMember.weightKg.toString()}
                      onChangeText={(text: string) =>
                        setNewMember({
                          ...newMember,
                          weightKg: parseInt(text) || 0,
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="70"
                      placeholderTextColor={theme.muted}
                    />
                  </View>
                </View>
              </CashFormSection>

              <CashFormSection title="Дополнительная информация">
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    Дополнительно
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
                    value={newMember.additionalInfo || ""}
                    onChangeText={(text: string) =>
                      setNewMember({ ...newMember, additionalInfo: text })
                    }
                    placeholder="Аллергии, особенности здоровья, диета..."
                    placeholderTextColor={theme.muted}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    maxLength={1000}
                  />
                </View>
              </CashFormSection>

              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Сохранить члена семьи"
                scaleTo={0.97}
                onPress={() => void handleAdd()}
              >
                <View
                  style={[
                    styles.saveButton,
                    { backgroundColor: theme.primary },
                  ]}
                >
                  <Text style={[styles.saveButtonText, { color: theme.white }]}>
                    {editingIndex === null ? "Добавить" : "Сохранить"}
                  </Text>
                </View>
              </AnimatedPressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </FullModalWindow>
    </>
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
    width: "100%",
    marginBottom: 14,
  },
  headingCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 23,
    fontWeight: "700",
  },
  headingIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  addMemberButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    padding: 13,
  },
  addMemberIcon: {
    alignItems: "center",
    borderRadius: 13,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  addMemberText: { flex: 1, fontSize: 15, fontWeight: "700" },
  familyList: {
    width: "100%",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginVertical: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  saveButton: {
    minHeight: 50,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  keyboardAvoiding: {
    flex: 1,
    width: "100%",
  },
  modal: {
    borderRadius: 26,
    borderWidth: 1,
    maxHeight: "86%",
    padding: 24,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  modalBadge: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  modalTitle: {
    flex: 1,
    fontFamily: "serif",
    fontSize: 23,
    fontWeight: "700",
  },
  formContent: { paddingBottom: 8, gap: 20 },
});
