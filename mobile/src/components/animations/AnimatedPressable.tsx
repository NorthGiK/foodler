import React, { useRef, useCallback, useState } from "react";
import {
  Pressable,
  Animated,
  GestureResponderEvent,
  PressableProps,
  ViewStyle,
  StyleProp,
} from "react-native";
import { springSnappy } from "./animations";
import { useReducedMotion } from "./useReducedMotion";

interface AnimatedPressableProps extends PressableProps {
  scaleTo?: number;
  children: React.ReactNode;
  style?: PressableProps["style"];
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
  const reducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);

  const resolvedStyle: StyleProp<ViewStyle> =
    typeof style === "function" ? style({ pressed }) : style;

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true);
      if (reducedMotion) scale.setValue(1);
      else
        Animated.spring(scale, { toValue: scaleTo, ...springSnappy }).start();
      onPressIn?.(event);
    },
    [reducedMotion, scale, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      if (reducedMotion) scale.setValue(1);
      else Animated.spring(scale, { toValue: 1, ...springSnappy }).start();
      onPressOut?.(event);
    },
    [reducedMotion, scale, onPressOut],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      <Animated.View style={[{ transform: [{ scale }] }, resolvedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
