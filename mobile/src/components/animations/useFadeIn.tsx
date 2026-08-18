import { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import {
  timingConfig,
  entranceInterpolation,
  springGentle,
} from "./animations";
import { useReducedMotion } from "./useReducedMotion";

type Options = {
  delay?: number;
  duration?: number;
  slideDistance?: number;
  useNativeDriver?: boolean;
  useSpring?: boolean;
};

export function useFadeIn(options: Options = {}) {
  const {
    delay = 0,
    duration = 400,
    slideDistance = 20,
    useNativeDriver = true,
    useSpring = false,
  } = options;
  const anim = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      anim.setValue(1);
      return () => undefined;
    }
    if (useSpring) {
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(anim, {
          toValue: 1,
          ...springGentle,
          useNativeDriver,
        }),
      ]).start();
    } else {
      Animated.timing(anim, {
        toValue: 1,
        ...timingConfig(duration),
        delay,
        useNativeDriver,
      }).start();
    }
    return () => anim.stopAnimation();
  }, [anim, delay, duration, reducedMotion, useNativeDriver, useSpring]);

  const animatedStyle = entranceInterpolation(anim, slideDistance);

  return { anim, animatedStyle };
}

type FadeInViewProps = Options & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function FadeInView({ children, style, ...options }: FadeInViewProps) {
  const { animatedStyle } = useFadeIn(options);
  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
}

export function useStaggeredFadeIn(count: number, baseDelay = 80) {
  const anims = useRef<Animated.Value[]>(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      anims.forEach((anim) => anim.setValue(1));
      return () => undefined;
    }
    const animations = anims.map((anim, i) =>
      Animated.spring(anim, {
        toValue: 1,
        ...springGentle,
        delay: i * baseDelay,
        useNativeDriver: true,
      }),
    );
    Animated.stagger(baseDelay, animations).start();
    return () => anims.forEach((anim) => anim.stopAnimation());
  }, [anims, baseDelay, reducedMotion]);

  return anims.map((anim) => entranceInterpolation(anim, 20));
}
