import { Animated, Easing } from "react-native";

// Apple-like spring easing
export const easing = Easing.bezier(0.16, 1, 0.3, 1);

// Smooth spring configs
export const springConfig = {
  tension: 100,
  friction: 12,
  useNativeDriver: true,
};

export const springWobbly = {
  tension: 150,
  friction: 7,
  useNativeDriver: true,
};

export const springSnappy = {
  tension: 200,
  friction: 15,
  useNativeDriver: true,
};

export const springGentle = {
  tension: 80,
  friction: 14,
  useNativeDriver: true,
};

export const timingConfig = (duration = 400) => ({
  duration,
  easing,
  useNativeDriver: true,
});

export const slideUpInterpolation = (
  anim: Animated.Value,
  from = 30,
  to = 0,
) => ({
  transform: [
    {
      translateY: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [from, to],
      }),
    },
  ],
});

export const slideDownInterpolation = (
  anim: Animated.Value,
  from = -30,
  to = 0,
) => ({
  transform: [
    {
      translateY: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [from, to],
      }),
    },
  ],
});

export const fadeInInterpolation = (
  anim: Animated.Value,
  from = 0,
  to = 1,
) => ({
  opacity: anim.interpolate({
    inputRange: [0, 1],
    outputRange: [from, to],
  }),
});

export const scaleInterpolation = (
  anim: Animated.Value,
  from = 0.95,
  to = 1,
) => ({
  transform: [
    {
      scale: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [from, to],
      }),
    },
  ],
});

// Combined entrance animation
export const entranceInterpolation = (
  anim: Animated.Value,
  slideDistance = 20,
) => ({
  ...fadeInInterpolation(anim),
  ...slideUpInterpolation(anim, slideDistance, 0),
  ...scaleInterpolation(anim, 0.97, 1),
});
