import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import {
  timingConfig,
  scaleInterpolation,
  fadeInInterpolation,
} from "./animations";

type Options = {
  delay?: number;
  duration?: number;
  useNativeDriver?: boolean;
};

export function useScaleIn(options: Options = {}) {
  const { delay = 0, duration = 350, useNativeDriver = true } = options;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      ...timingConfig(duration),
      delay,
      useNativeDriver,
    }).start();
  }, [anim, delay, duration, useNativeDriver]);

  const animatedStyle = {
    ...fadeInInterpolation(anim),
    ...scaleInterpolation(anim),
  };

  return { anim, animatedStyle };
}

type ScaleInViewProps = Options & {
  children: React.ReactNode;
  style?: any;
};

export function ScaleInView({ children, style, ...options }: ScaleInViewProps) {
  const { animatedStyle } = useScaleIn(options);
  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
}
