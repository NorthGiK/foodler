import React, { useRef, useCallback } from "react";
import {
  Pressable,
  Animated,
  GestureResponderEvent,
  PressableProps,
  ViewStyle,
  StyleProp,
} from "react-native";
import { springSnappy } from "./animations";

interface AnimatedPressableProps extends PressableProps {
  scaleTo?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({
  scaleTo = 0.96,
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      Animated.spring(scale, {
        toValue: scaleTo,
        ...springSnappy,
      }).start();
      onPressIn?.(event);
    },
    [scale, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      Animated.spring(scale, {
        toValue: 1,
        ...springSnappy,
      }).start();
      onPressOut?.(event);
    },
    [scale, onPressOut],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
