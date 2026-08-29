import React from "react";
import { Pressable, Text, View } from "react-native";

import { tracer } from "@/tracer";

type Props = { children: React.ReactNode };
type State = { failed: boolean };

export class TracerErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error): void { void tracer.captureException(error); }
  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return <View accessibilityRole="alert"><Text>Не удалось открыть экран.</Text><Pressable onPress={() => this.setState({ failed: false })}><Text>Повторить</Text></Pressable></View>;
  }
}
