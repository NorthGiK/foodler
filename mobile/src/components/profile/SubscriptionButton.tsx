import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../../../App";
import { useAuth } from "@/api/auth";
import { RainbowGlowButton } from "@/components/RainbowGlowButton";

export function SubscriptionButton() {
  const { isAuthenticated } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <RainbowGlowButton
      title="Подписка"
      variant="premium"
      onPress={() =>
        navigation.navigate(isAuthenticated ? "Subscription" : "Login")
      }
    />
  );
}
