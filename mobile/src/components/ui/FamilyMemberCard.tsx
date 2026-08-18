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
                ? theme.primaryContainer
                : theme.secondary + "18",
          },
        ]}
      >
        <MaterialIcons
          name={member.gender === "male" ? "face" : "face-3"}
          size={24}
          color={
            member.gender === "male"
              ? theme.onPrimaryContainer
              : theme.secondary
          }
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
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`Изменить профиль ${member.name}`}
          scaleTo={0.85}
          onPress={onEdit}
        >
          <View
            style={[
              styles.deleteBtn,
              { backgroundColor: theme.primaryContainer },
            ]}
          >
            <MaterialIcons name="edit" size={17} color={theme.primary} />
          </View>
        </AnimatedPressable>
      ) : null}
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`Удалить профиль ${member.name}`}
        scaleTo={0.85}
        onPress={onDelete}
      >
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
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    gap: 11,
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
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
});
