import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";
import { FamilyMember, UserProfile } from "../../types";
import {
  AddButton,
  CashFormInput,
  CashFormScreen,
  CashFormSection,
  FamilyMemberCard,
} from "../ui";
import FullModalWindow from "../FullModalWindow";

interface FamilySectionProps {
  profile: UserProfile;
  onAddMember: (member: FamilyMember) => Promise<boolean>;
  onRemoveMember: (index: number) => void;
}

export function FamilySection({
  profile,
  onAddMember,
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

  const handleAdd = async () => {
    if (!newMember.name.trim()) {
      setMemberError("Введите имя члена семьи");
      return;
    }
    if (!(await onAddMember(newMember))) return;
    setNewMember({
      name: "",
      age: 0,
      gender: "male",
      heightCm: 0,
      weightKg: 0,
      dietaryPreferences: [],
      healthGoals: [],
    });
    setMemberError("");
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
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Члены семьи
          </Text>
        </View>
        <AddButton
          title=""
          icon="person-add"
          variant="secondary"
          onPress={() => setModalVisible(true)}
          style={{ marginBottom: 16, padding: 4 }}
        />

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
                  onDelete={() => onRemoveMember(index)}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Add Member Modal */}
      <FullModalWindow visible={modalVisible} setVisible={setModalVisible}>
        <CashFormScreen title="Добавить члена семьи">
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
                <Text style={[styles.label, { color: theme.text }]}>Пол</Text>
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
                      gender: newMember.gender === "male" ? "female" : "male",
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

          <AnimatedPressable scaleTo={0.97} onPress={() => void handleAdd()}>
            <View
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.saveButtonText, { color: theme.white }]}>
                Добавить
              </Text>
            </View>
          </AnimatedPressable>
        </CashFormScreen>
      </FullModalWindow>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  familyList: {
    width: "100%",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginVertical: 12,
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
    borderRadius: 12,
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
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
