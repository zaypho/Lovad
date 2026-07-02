import React from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const Bar: React.FC<{ delay: number }> = ({ delay }) => {
  const h = useSharedValue(3);

  React.useEffect(() => {
    h.value = withDelay(
      delay,
      withRepeat(
        withTiming(9, { duration: 280, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [h, delay]);

  const style = useAnimatedStyle(() => ({ height: h.value }));

  return (
    <Animated.View
      style={[
        { width: 2, borderRadius: 1, backgroundColor: "#FFFFFF" },
        style,
      ]}
    />
  );
};

/** Tiny animated 3-bar equalizer shown while someone is speaking. */
export const SpeakingBars: React.FC = () => (
  <View
    testID="speaking-bars"
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 1.5,
      height: 11,
    }}
  >
    <Bar delay={0} />
    <Bar delay={120} />
    <Bar delay={240} />
  </View>
);
