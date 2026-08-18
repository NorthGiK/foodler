import React, { useContext } from "react";
import { ViewStyle, StyleProp } from "react-native";
import Modal, { Direction } from "react-native-modal";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useReducedMotion } from "./animations";

type Props = {
  visible: boolean;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
  swipeDirection?: Direction | Direction[];
  style?: StyleProp<ViewStyle>;
  children: React.JSX.Element;
};

export default function FullModalWindow({
  visible,
  setVisible,
  swipeDirection,
  children,
  style,
}: Props) {
  const insets = useContext(SafeAreaInsetsContext);
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      isVisible={visible}
      swipeDirection={swipeDirection || "down"}
      onSwipeComplete={() => setVisible(false)}
      onBackdropPress={() => setVisible(false)}
      onBackButtonPress={() => setVisible(false)}
      animationIn={
        reducedMotion
          ? { from: { opacity: 1 }, to: { opacity: 1 } }
          : "slideInUp"
      }
      animationOut={
        reducedMotion
          ? { from: { opacity: 1 }, to: { opacity: 1 } }
          : "slideOutDown"
      }
      animationInTiming={reducedMotion ? 0 : 240}
      animationOutTiming={reducedMotion ? 0 : 180}
      backdropTransitionInTiming={reducedMotion ? 0 : 220}
      backdropTransitionOutTiming={reducedMotion ? 0 : 160}
      style={[
        style,
        {
          justifyContent: "flex-end",
          margin: 0,
          paddingBottom: insets?.bottom ?? 0,
        },
      ]}
    >
      {children}
    </Modal>
  );
}
