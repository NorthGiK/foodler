import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
} from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from "../ThemeContext";
import { getAvaibleCredits } from "@/api/client";
import { AiActionType, ACTION_LABELS } from "@/ai/types";

const CREDIT_ACTIONS: AiActionType[] = [
  "analysis",
  "save_money",
  "health",
  "recipe",
  "cart",
  "ingredients",
  "habits",
  "diet",
];

export function AiCreditsCard() {
  const { theme } = useTheme();
  const [credits, setCredits] = useState<number | null>(null);
  const [maxCredits, setMaxCredits] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Animated values for the loading/charging effect
  const rotateAnim = React.useRef(new Animated.Value(0)).current;
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const chargeAnim = React.useRef(new Animated.Value(0)).current;

  const loadCredits = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const creditsData = await getAvaibleCredits();
      setCredits(creditsData.remaining);
      setMaxCredits(creditsData.limit);
    } catch {
      setCredits(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    if (loading) {
      const rotation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      rotation.start();

      return () => {
        rotation.stop();
      };
    } else if (credits !== null) {
      // Charging animation when credits are loaded
      const progress = Math.min(credits / maxCredits, 1);

      // Progress bar animation
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 1500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // Charging pulse effect
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(chargeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(chargeAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [chargeAnim, credits, loading, maxCredits, progressAnim, rotateAnim]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const chargeInterpolate = chargeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const displayCredits = credits ?? 0;
  const isLowCredits = displayCredits <= 2 && displayCredits > 0;
  const isEmptyCredits = displayCredits === 0;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.primary + "15" },
            ]}
          >
            {loading ? (
              <Animated.View
                style={[
                  styles.loadingIcon,
                  { transform: [{ rotate: rotateInterpolate }] },
                ]}
              >
                <MaterialIcons
                  name="auto-awesome"
                  size={24}
                  color={theme.primary}
                />
              </Animated.View>
            ) : (
              <MaterialIcons
                name="auto-awesome"
                size={24}
                color={theme.primary}
              />
            )}
          </View>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>
              AI-действия
            </Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              {loading
                ? "Загрузка..."
                : loadError
                  ? "Данные временно недоступны"
                  : `${displayCredits} из ${maxCredits} доступно`}
            </Text>
          </View>
        </View>

        {!loading && !loadError && (
          <Animated.View
            style={[
              styles.creditsBadge,
              {
                backgroundColor: isEmptyCredits
                  ? theme.error + "15"
                  : isLowCredits
                    ? theme.accent2 + "15"
                    : theme.primary + "15",
                transform: [{ scale: chargeInterpolate }],
              },
            ]}
          >
            <Text
              style={[
                styles.creditsNumber,
                {
                  color: isEmptyCredits
                    ? theme.error
                    : isLowCredits
                      ? theme.accent2
                      : theme.primary,
                },
              ]}
            >
              {displayCredits}
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Progress Bar with Charging Effect */}
      {!loadError && (
        <View style={styles.progressContainer}>
          <View
            style={[styles.progressTrack, { backgroundColor: theme.border }]}
          >
            <Animated.View
              style={[
                styles.progressFill,
                {
                  transform: [{ scaleX: progressAnim }],
                  backgroundColor: isEmptyCredits
                    ? theme.error
                    : isLowCredits
                      ? theme.accent2
                      : theme.primary,
                },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressLabel, { color: theme.muted }]}>
              0
            </Text>
            <Text style={[styles.progressLabel, { color: theme.muted }]}>
              {maxCredits}
            </Text>
          </View>
        </View>
      )}

      {/* Credits Grid */}
      {!loading && !loadError && (
        <View style={styles.creditsGrid}>
          {CREDIT_ACTIONS.map((action, index) => {
            const isAvailable = index < displayCredits;
            const actionLabel = ACTION_LABELS[action];

            return (
              <View
                key={action}
                style={[
                  styles.creditItem,
                  {
                    backgroundColor: isAvailable
                      ? theme.primary + "10"
                      : theme.surfaceElevated,
                    borderColor: isAvailable
                      ? theme.primary + "30"
                      : theme.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={
                    (action === "analysis" && "analytics") ||
                    (action === "save_money" && "savings") ||
                    (action === "health" && "favorite") ||
                    (action === "recipe" && "restaurant") ||
                    (action === "cart" && "shopping-cart") ||
                    (action === "ingredients" && "science") ||
                    (action === "habits" && "schedule") ||
                    (action === "diet" && "spa") ||
                    "help-outline"
                  }
                  size={18}
                  color={isAvailable ? theme.primary : theme.muted}
                />
                <Text
                  style={[
                    styles.creditLabel,
                    {
                      color: isAvailable ? theme.text : theme.muted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {actionLabel}
                </Text>
                {isAvailable && (
                  <View
                    style={[
                      styles.availableDot,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <View style={styles.creditsGrid}>
          {CREDIT_ACTIONS.map((_, index) => (
            <View
              key={index}
              style={[
                styles.creditItem,
                styles.skeletonItem,
                { backgroundColor: theme.surfaceElevated },
              ]}
            >
              <View
                style={[styles.skeletonIcon, { backgroundColor: theme.border }]}
              />
              <View
                style={[styles.skeletonText, { backgroundColor: theme.border }]}
              />
            </View>
          ))}
        </View>
      )}

      {!loading && loadError && (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: theme.error + "10",
              borderColor: theme.error + "20",
            },
          ]}
        >
          <MaterialIcons name="cloud-off" size={18} color={theme.error} />
          <Text style={[styles.infoText, { color: theme.text }]}>
            Не удалось получить доступное количество AI-действий.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadCredits()}
            hitSlop={8}
          >
            <Text style={[styles.retryText, { color: theme.primary }]}>
              Повторить
            </Text>
          </Pressable>
        </View>
      )}

      {/* Info Text */}
      {!loading && !loadError && isEmptyCredits && (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: theme.error + "10",
              borderColor: theme.error + "20",
            },
          ]}
        >
          <MaterialIcons name="info-outline" size={16} color={theme.error} />
          <Text style={[styles.infoText, { color: theme.error }]}>
            Кредиты закончились. Оформите подписку или подождите.
          </Text>
        </View>
      )}

      {!loading && !loadError && isLowCredits && (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: theme.accent2 + "10",
              borderColor: theme.accent2 + "20",
            },
          ]}
        >
          <MaterialIcons name="warning-amber" size={16} color={theme.accent2} />
          <Text style={[styles.infoText, { color: theme.accent2 }]}>
            Осталось мало кредитов. Оформите подписку или подождите.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  creditsBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 60,
    alignItems: "center",
  },
  creditsNumber: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
    transformOrigin: "left center",
    width: "100%",
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  creditsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  creditItem: {
    flex: 1,
    minWidth: "30%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    position: "relative",
  },
  creditLabel: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  availableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  skeletonItem: {
    opacity: 0.6,
  },
  skeletonIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  skeletonText: {
    height: 12,
    width: 50,
    borderRadius: 6,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
