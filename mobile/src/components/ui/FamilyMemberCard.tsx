import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import { useTheme } from "../ThemeContext";
import { FamilyMember } from "../../types";

interface FamilyMemberCardProps {
  member: FamilyMember;
  onDelete: () => void;
  onEdit?: () => void;
  style?: ViewStyle;
}

export function FamilyMemberCard({
  member,
  onDelete,
  onEdit,
  style,
}: FamilyMemberCardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              member.gender === "male"
                ? theme.primary + "18"
                : theme.accent2 + "18",
          },
        ]}
      >
        <MaterialIcons
          name={member.gender === "male" ? "face" : "face-3"}
          size={24}
          color={member.gender === "male" ? "#00ffdd" : "#ff7de9"}
        />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]}>{member.name}</Text>
        <Text style={[styles.details, { color: theme.muted }]}>
          {member.age} лет · {member.gender === "male" ? "М" : "Ж"} ·{" "}
          {member.heightCm} см · {member.weightKg} кг
        </Text>
        {member.additionalInfo ? (
          <Text
            style={[styles.additionalInfo, { color: theme.muted }]}
            numberOfLines={1}
          >
            {member.additionalInfo}
          </Text>
        ) : null}
      </View>
      {onEdit ? (
        <AnimatedPressable scaleTo={0.85} onPress={onEdit}>
          <View
            style={[
              styles.deleteBtn,
              { backgroundColor: theme.primary + "15" },
            ]}
          >
            <MaterialIcons name="edit" size={17} color={theme.primary} />
          </View>
        </AnimatedPressable>
      ) : null}
      <AnimatedPressable scaleTo={0.85} onPress={onDelete}>
        <View
          style={[styles.deleteBtn, { backgroundColor: theme.error + "15" }]}
        >
          <MaterialIcons name="close" size={18} color={theme.error} />
        </View>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  details: {
    fontSize: 12,
  },
  additionalInfo: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
});
