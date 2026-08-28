import type { Theme } from "@/themes";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { analyticsEvents } from "../analytics/facade";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import { useTheme } from "../components/ThemeContext";
import {
  AnalyticsPreferenceCard,
  ConfirmModal,
  FamilySection,
  FeedbackSection,
  ProfileInfoCard,
  StoreNamesSection,
  SubscriptionButton,
} from "../components/profile";
import { getAccountTheme } from "../components/profile/accountTheme";
import { loadProfile, saveProfile } from "../profileStorage";
import { StoreAliases } from "../storeAliases";
import { UserProfile, defaultProfile } from "../types";

type Route = "home" | "account" | "family" | "privacy" | "stores" | "feedback";
const tomato = require("../assets/TomatoShape.png") as number;
type Props = {
  stores: string[];
  storeAliases: StoreAliases;
  onSaveStoreAlias: (store: string, alias: string) => Promise<void>;
  onRestoreStoreAlias: (store: string) => Promise<void>;
};
type MenuItem = {
  route: Route;
  label: string;
  caption: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
};

const accountMenu: MenuItem[] = [
  {
    route: "account",
    label: "Аккаунт",
    caption: "Личные данные, подписка и AI",
    icon: "person",
  },
  {
    route: "family",
    label: "Семья",
    caption: "Профили близких",
    icon: "groups-2",
  },
  {
    route: "privacy",
    label: "Приватность и данные",
    caption: "Продуктовая аналитика",
    icon: "shield",
  },
];
const commonMenu: MenuItem[] = [
  {
    route: "stores",
    label: "Настройки чеков",
    caption: "Названия магазинов на устройстве",
    icon: "receipt",
  },
  {
    route: "feedback",
    label: "Обратная связь",
    caption: "Написать команде Foodler",
    icon: "chat",
  },
];

export function ProfileScreen({
  stores,
  storeAliases,
  onSaveStoreAlias,
  onRestoreStoreAlias,
}: Props) {
  const { theme, themeName } = useTheme();
  const accountTheme = getAccountTheme(theme, themeName);
  const styles = getStyles(theme);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, isAuthenticated, refreshUser } = useAuth();
  const [route, setRoute] = useState<Route>("home");
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      void loadProfile().then(setProfile);
    }, []),
  );
  const persist = async (next: UserProfile) => {
    try {
      await saveProfile(next);
      setProfile(next);
      return true;
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить изменения на устройстве.");
      return false;
    }
  };
  const saveAccount = async () => {
    if (await persist(profile)) setEditing(false);
  };
  const deleteMember = async () => {
    if (deleteIndex !== null)
      await persist({
        ...profile,
        familyMembers: profile.familyMembers.filter(
          (_, index) => index !== deleteIndex,
        ),
      });
    setDeleteIndex(null);
  };
  const feedback = async (email: string, text: string, images: string[]) => {
    await api.sendFeedback(email, text, images);
    void analyticsEvents.feedbackSubmitted();
  };
  const menu = (items: MenuItem[]) => (
    <View style={styles.menu}>
      {items.map((item, index) => (
        <Pressable
          key={item.route}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={() => setRoute(item.route)}
          style={({ pressed }) => [
            styles.menuRow,
            index > 0 && {
              borderTopColor: theme.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
            { opacity: pressed ? 0.68 : 1 },
          ]}
        >
          <View style={styles.menuIcon}>
            <MaterialIcons
              name={item.icon}
              color={theme.onPrimaryContainer}
              size={21}
            />
          </View>
          <View style={styles.menuCopy}>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={[styles.menuCaption, { color: theme.muted }]}>
              {item.caption}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={23} color={theme.muted} />
        </Pressable>
      ))}
    </View>
  );
  if (route !== "home")
    return (
      <SafeAreaView
        style={[
          styles.page,
          {
            backgroundColor:
              route === "account" ? accountTheme.background : theme.bg,
          },
        ]}
        edges={["top"]}
      >
        <Pressable
          accessibilityLabel="Назад к профилю"
          onPress={() => {
            setEditing(false);
            setRoute("home");
          }}
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: theme.surfaceElevated,
              opacity: pressed ? 0.68 : 1,
            },
          ]}
        >
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <KeyboardAvoidingView
          style={styles.page}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={[
              styles.detailContent,
              route === "account" && {
                backgroundColor: accountTheme.background,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {route === "account" ? (
              <>
                <Text
                  style={[styles.accountIntro, { color: accountTheme.muted }]}
                >
                  Заполните профиль — рекомендации станут точнее и полезнее для
                  вашей семьи.
                </Text>
                <SubscriptionButton />
                <ProfileInfoCard
                  profile={profile}
                  editing={editing}
                  onEdit={() => setEditing(true)}
                  onCancel={() => setEditing(false)}
                  onSave={() => void saveAccount()}
                  onProfileChange={setProfile}
                />
              </>
            ) : null}
            {route === "family" ? (
              <FamilySection
                profile={profile}
                onRemoveMember={(index) => setDeleteIndex(index)}
              />
            ) : null}
            {route === "privacy" ? (
              <AnalyticsPreferenceCard
                accountMode={user?.analyticsIdentityMode}
                isAuthenticated={isAuthenticated}
                onSynced={refreshUser}
              />
            ) : null}
            {route === "stores" ? (
              <StoreNamesSection
                stores={stores}
                aliases={storeAliases}
                onSave={onSaveStoreAlias}
                onRestore={onRestoreStoreAlias}
              />
            ) : null}
            {route === "feedback" ? (
              <FeedbackSection
                userEmail={user?.email}
                onSendFeedback={feedback}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
        <ConfirmModal
          visible={deleteIndex !== null}
          title="Удалить члена семьи?"
          message="Профиль будет удалён только с этого устройства."
          confirmText="Удалить"
          destructive
          onConfirm={() => void deleteMember()}
          onCancel={() => setDeleteIndex(null)}
        />
      </SafeAreaView>
    );
  return (
    <>
      <ScrollView
        style={[styles.page, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.text }]}>Профиль</Text>
        {isAuthenticated && user ? (
          <>
            <View
              style={[
                styles.identity,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: theme.primaryContainer },
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    { color: theme.onPrimaryContainer },
                  ]}
                >
                  {user.email.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.identityText}>
                <Text
                  style={[styles.email, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
                <Text style={[styles.status, { color: theme.muted }]}>
                  {user.premium ? "Подписка активна" : "Бесплатный аккаунт"}
                </Text>
              </View>
            </View>
            <Text style={[styles.section, { color: theme.secondary }]}>
              АККАУНТ
            </Text>
            {menu(accountMenu)}
            <Text style={[styles.section, { color: theme.secondary }]}>
              НАСТРОЙКИ ПРИЛОЖЕНИЯ
            </Text>
            {menu(commonMenu)}
            <Pressable
              accessibilityRole="button"
              onPress={() => setLogoutConfirmVisible(true)}
              style={styles.logout}
            >
              <MaterialIcons name="logout" color={theme.error} size={19} />
              <Text style={[styles.logoutText, { color: theme.error }]}>
                Выйти из аккаунта
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <View
              style={[styles.guestHero, { backgroundColor: theme.secondary }]}
            >
              <Image source={tomato} style={styles.tomato} />
              <Text style={styles.guestEyebrow}>
                FOODLER НА ВАШЕМ УСТРОЙСТВЕ
              </Text>
              <Text style={styles.guestTitle}>
                Покупки уже здесь.{"\n"}Синхронизация — после входа.
              </Text>
              <Text style={styles.guestCopy}>
                Создайте аккаунт, чтобы сохранить историю и продолжить с другого
                устройства.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Войти в аккаунт"
                onPress={() => navigation.navigate("Login")}
                style={[styles.guestButton, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.guestButtonText, { color: theme.white }]}>
                  Войти в аккаунт
                </Text>
                <MaterialIcons
                  name="arrow-forward"
                  color={theme.white}
                  size={20}
                />
              </Pressable>
            </View>
            <Text style={[styles.section, { color: theme.secondary }]}>
              НАСТРОЙКИ ПРИЛОЖЕНИЯ
            </Text>
            {menu(commonMenu)}
            <Text style={[styles.section, { color: theme.secondary }]}>
              ПРИВАТНОСТЬ
            </Text>
            <AnalyticsPreferenceCard isAuthenticated={false} />
          </>
        )}
      </ScrollView>
      <ConfirmModal
        visible={logoutConfirmVisible}
        title="Выйти из аккаунта?"
        message="Локальные чеки останутся на этом устройстве."
        confirmText="Выйти"
        destructive
        onConfirm={() => {
          setLogoutConfirmVisible(false);
          void logout();
        }}
        onCancel={() => setLogoutConfirmVisible(false)}
      />
    </>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { flex: 1 },
    content: { paddingBottom: 108, paddingHorizontal: 24, paddingTop: 27 },
    title: {
      fontFamily: "serif",
      fontSize: 42,
      fontWeight: "500",
      letterSpacing: -1.1,
      lineHeight: 58,
      marginBottom: 15,
    },
    identity: {
      alignItems: "center",
      borderRadius: 26,
      borderWidth: 1,
      flexDirection: "row",
      padding: 18,
    },
    avatar: {
      alignItems: "center",
      borderRadius: 25,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    avatarText: { fontFamily: "serif", fontSize: 23, fontWeight: "700" },
    identityText: { flex: 1, marginLeft: 13 },
    email: { fontSize: 16, fontWeight: "700" },
    status: { fontSize: 13, marginTop: 3 },
    section: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.15,
      marginBottom: 10,
      marginTop: 28,
    },
    menu: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      overflow: "hidden",
    },
    menuRow: {
      alignItems: "center",
      flexDirection: "row",
      minHeight: 78,
      paddingHorizontal: 16,
    },
    menuIcon: {
      backgroundColor: theme.primaryContainer,
      alignItems: "center",
      borderRadius: 14,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    menuCopy: { flex: 1, marginHorizontal: 13 },
    menuLabel: { color: theme.text, fontSize: 17, fontWeight: "700" },
    menuCaption: { fontSize: 12, lineHeight: 17, marginTop: 2 },
    logout: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      marginTop: 22,
      padding: 17,
    },
    logoutText: { fontSize: 15, fontWeight: "700" },
    guestHero: {
      borderRadius: 28,
      marginTop: 2,
      overflow: "hidden",
      padding: 24,
    },
    tomato: {
      height: 170,
      opacity: 0.34,
      position: "absolute",
      right: -53,
      top: -42,
      width: 170,
    },
    guestEyebrow: {
      color: "#F7D8B0",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    guestTitle: {
      color: "#FFF8EC",
      fontFamily: "serif",
      fontSize: 29,
      fontWeight: "700",
      letterSpacing: -0.6,
      lineHeight: 34,
      marginTop: 8,
    },
    guestCopy: {
      color: "#E0E7D9",
      fontSize: 14,
      lineHeight: 20,
      marginTop: 11,
      paddingRight: 25,
    },
    guestButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderRadius: 14,
      flexDirection: "row",
      gap: 10,
      marginTop: 20,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    guestButtonText: { fontSize: 15, fontWeight: "800" },
    backButton: {
      alignItems: "center",
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      marginLeft: 24,
      marginTop: 10,
      width: 40,
    },
    detailContent: { padding: 24, paddingBottom: 108, paddingTop: 12 },
    accountIntro: {
      fontSize: 14,
      lineHeight: 19,
      marginBottom: 12,
      maxWidth: 340,
    },
  });
