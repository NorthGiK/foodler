import React, { useRef, useCallback } from "react";
import {
  Pressable,
  Animated,
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
    (e: any) => {
      Animated.spring(scale, {
        toValue: scaleTo,
        ...springSnappy,
      }).start();
      onPressIn?.(e);
    },
    [scale, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: any) => {
      Animated.spring(scale, {
        toValue: 1,
        ...springSnappy,
      }).start();
      onPressOut?.(e);
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
      <Animated.View style={[{ transform: [{ scale }] }, style as any]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
