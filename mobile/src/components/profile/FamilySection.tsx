import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RootStackParamList } from "../../../App";
import { useTheme } from "../ThemeContext";
import { FamilyMember, UserProfile } from "../../types";
import { FamilyMemberCard } from "../ui";

interface FamilySectionProps {
  profile: UserProfile;
  onAddMember?: (member: FamilyMember) => Promise<boolean>;
  onUpdateMember?: (index: number, member: FamilyMember) => Promise<boolean>;
  onRemoveMember: (index: number) => void;
}

export function FamilySection({ profile, onRemoveMember }: FamilySectionProps) {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.sectionHeader}>
        <View>
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
        onPress={() => navigation.navigate("FamilyMember", {})}
        style={({ pressed }) => [
          styles.addButton,
          { borderColor: theme.border, opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <MaterialIcons name="person-add" size={21} color={theme.primary} />
        <Text style={[styles.addText, { color: theme.text }]}>
          Добавить члена семьи
        </Text>
        <MaterialIcons name="chevron-right" size={23} color={theme.muted} />
      </Pressable>
      {profile.familyMembers.length === 0 ? (
        <Text style={[styles.empty, { color: theme.muted }]}>
          Нет добавленных членов семьи
        </Text>
      ) : (
        <View>
          {profile.familyMembers.map((member: FamilyMember, index) => (
            <View key={index} style={styles.member}>
              <FamilyMemberCard
                member={member}
                onEdit={() => navigation.navigate("FamilyMember", { index })}
                onDelete={() => onRemoveMember(index)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, borderWidth: 1, marginBottom: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  sectionTitle: { fontFamily: "serif", fontSize: 23, fontWeight: "700" },
  headingIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  addButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    padding: 15,
  },
  addText: { flex: 1, fontSize: 15, fontWeight: "700" },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginVertical: 14,
  },
  member: { marginBottom: 10 },
});
