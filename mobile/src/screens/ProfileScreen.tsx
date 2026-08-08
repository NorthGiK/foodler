import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import { useTheme } from "../components/ThemeContext";
import {
  AnimatedPressable,
  useStaggeredFadeIn,
} from "../components/animations";
import {
  ProfileHeaderCard,
  ProfileGuestCard,
  SubscriptionButton,
  ProfileInfoCard,
  FamilySection,
  FeedbackSection,
  ConfirmModal,
  AiCreditsCard,
} from "../components/profile";
import { loadProfile, saveProfile } from "../profileStorage";
import { FamilyMember, UserProfile, defaultProfile } from "../types";

export function ProfileScreen() {
  const { theme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(
    null,
  );
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const cardStyles = useStaggeredFadeIn(8, 80);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const handleSaveProfile = async () => {
    try {
      await saveProfile(profile);
      setEditing(false);
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить профиль.");
    }
  };

  const handleAddMember = async (member: FamilyMember) => {
    const updated = {
      ...profile,
      familyMembers: [...profile.familyMembers, member],
    };
    try {
      await saveProfile(updated);
      setProfile(updated);
      return true;
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить члена семьи.");
      return false;
    }
  };

  const handleRemoveMember = (index: number) => {
    setDeleteConfirmIndex(index);
    setDeleteConfirmVisible(true);
  };

  const confirmDeleteMember = async () => {
    if (deleteConfirmIndex !== null) {
      const updated = {
        ...profile,
        familyMembers: profile.familyMembers.filter(
          (_, i) => i !== deleteConfirmIndex,
        ),
      };
      try {
        await saveProfile(updated);
        setProfile(updated);
      } catch {
        Alert.alert("Ошибка", "Не удалось удалить члена семьи.");
        return;
      }
    }
    setDeleteConfirmVisible(false);
    setDeleteConfirmIndex(null);
  };

  const handleLogout = () => setLogoutConfirmVisible(true);

  const confirmLogout = async () => {
    setLogoutConfirmVisible(false);
    await logout();
  };

  const handleSendFeedback = async (
    email: string,
    text: string,
    images: string[],
  ) => {
    await api.sendFeedback(email, text, images);
  };

  if (!isAuthenticated || !user) {
    return (
      <Animated.ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={cardStyles[0]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Профиль</Text>
          </View>
        </Animated.View>

        <Animated.View style={cardStyles[1]}>
          <ProfileGuestCard onLoginPress={() => navigation.navigate("Login")} />
          <AiCreditsCard />
        </Animated.View>

        <Animated.View style={cardStyles[2]}>
          <SubscriptionButton />
        </Animated.View>

        <Animated.View style={cardStyles[3]}>
          <FeedbackSection onSendFeedback={handleSendFeedback} />
        </Animated.View>
      </Animated.ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.bg }}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={cardStyles[0]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Профиль</Text>
          </View>
        </Animated.View>

        <Animated.View style={cardStyles[1]}>
          <ProfileHeaderCard
            email={user.email}
            isPremium={user.premium}
            subscriptionExpires={user.subscriptionExpires ?? undefined}
          />
        </Animated.View>

        <Animated.View style={cardStyles[2]}>
          <SubscriptionButton />
        </Animated.View>

        <Animated.View style={cardStyles[3]}>
          <AiCreditsCard />
        </Animated.View>

        <Animated.View style={cardStyles[4]}>
          <ProfileInfoCard
            profile={profile}
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancel={() => setEditing(false)}
            onSave={handleSaveProfile}
            onProfileChange={setProfile}
          />
        </Animated.View>

        <Animated.View style={cardStyles[5]}>
          <FamilySection
            profile={profile}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
          />
        </Animated.View>

        <Animated.View style={cardStyles[6]}>
          <AnimatedPressable scaleTo={0.95} onPress={handleLogout}>
            <View
              style={[
                styles.logoutBtn,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <MaterialIcons
                name="logout"
                size={18}
                color={theme.error || "#ff4444"}
              />
              <Text
                style={[styles.logoutText, { color: theme.error || "#ff4444" }]}
              >
                Выйти из аккаунта
              </Text>
            </View>
          </AnimatedPressable>
        </Animated.View>

        <Animated.View style={cardStyles[7]}>
          <FeedbackSection
            userEmail={user.email}
            onSendFeedback={handleSendFeedback}
          />
        </Animated.View>
      </ScrollView>

      <ConfirmModal
        visible={deleteConfirmVisible}
        title="Удаление"
        message="Вы уверены, что хотите удалить этого члена семьи?"
        confirmText="Удалить"
        destructive
        onConfirm={confirmDeleteMember}
        onCancel={() => setDeleteConfirmVisible(false)}
      />

      <ConfirmModal
        visible={logoutConfirmVisible}
        title="Выход"
        message="Вы уверены, что хотите выйти?"
        confirmText="Выйти"
        destructive
        onConfirm={confirmLogout}
        onCancel={() => setLogoutConfirmVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
