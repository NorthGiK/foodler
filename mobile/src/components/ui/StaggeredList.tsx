import React from "react";
import { ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from "react-native-reanimated";

interface StaggeredListProps {
  children: React.ReactNode[];
  style?: ViewStyle;
}

export function StaggeredList({ children, style }: StaggeredListProps) {
  return (
    <Animated.View style={style}>
      {children.map((child, index) => (
        <StaggeredItem key={index} index={index}>
          {child}
        </StaggeredItem>
      ))}
    </Animated.View>
  );
}

interface StaggeredItemProps {
  children: React.ReactNode;
  index: number;
}

function StaggeredItem({ children, index }: StaggeredItemProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  React.useEffect(() => {
    const delay = index * 100;
    opacity.value = withDelay(delay, withSpring(1, { damping: 20 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 20 }));
  }, [index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
