import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import LucideIcon from "@/lib/icons/LucideIcon";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return reduced;
}

export function ProcessingIndicator({ active }: { active: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) return;
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [active, reduced, rotation]);
  const animatedStyle = {
    transform: [
      { rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
    ],
  };
  return (
    <View
      accessible
      accessibilityLabel={active ? "Tailoring your resume" : "Tailoring paused"}
      accessibilityState={{ busy: active }}
      className="h-28 w-28 items-center justify-center rounded-full bg-primary/5"
    >
      <Animated.View style={[styles.ring, animatedStyle]}>
        <View className="h-full w-full rounded-full border-2 border-primary/15 border-t-primary" />
      </Animated.View>
      <View className="h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <LucideIcon
          name={active ? "FilePenLine" : "CircleAlert"}
          size={32}
          strokeWidth={1.5}
          className="text-primary"
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({ ring: { position: "absolute", width: 112, height: 112 } });
