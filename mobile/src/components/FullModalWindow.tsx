import React from "react";
import Modal, { Direction } from "react-native-modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
  swipeDirection?: Direction | Direction[];
  children: React.JSX.Element;
};

export default function FullModalWindow({
  visible,
  setVisible,
  swipeDirection,
  children,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      isVisible={visible}
      swipeDirection={swipeDirection || "down"}
      onSwipeComplete={() => setVisible(false)}
      onBackdropPress={() => setVisible(false)}
      onBackButtonPress={() => setVisible(false)}
      style={{
        justifyContent: "flex-end",
        margin: 0,
        paddingBottom: insets.bottom,
      }}
    >
      {children}
    </Modal>
  );
}
