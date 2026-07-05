import { useCallback, useRef } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Drives a "collapse on scroll-down, reveal on scroll-up" header section —
 * used below a fixed title bar on the Connect & Chats tabs. The title bar
 * itself never moves; only the secondary row (chips / shortcuts / search)
 * collapses away.
 *
 * Deliberately uses a *plain* JS onScroll callback (not
 * useAnimatedScrollHandler) — the worklet-based scroll handler is
 * unreliable together with Animated.FlatList on react-native-web, whereas
 * directly assigning to a shared value's `.value` from JS works identically
 * on every platform and still drives useAnimatedStyle correctly.
 *
 * Usage:
 *   const { onScroll, onLayout, collapsibleStyle } = useCollapsibleHeader();
 *   <Animated.View style={[{ overflow: "hidden" }, collapsibleStyle]}>
 *     <View onLayout={onLayout}>...secondary header content...</View>
 *   </Animated.View>
 *   <FlatList onScroll={onScroll} scrollEventThrottle={16} ... />
 */
export function useCollapsibleHeader() {
  const lastY = useRef(0);
  // 0 = fully expanded/visible, 1 = fully collapsed/hidden
  const progress = useSharedValue(0);
  const measuredHeight = useSharedValue(0);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      measuredHeight.value = e.nativeEvent.layout.height;
    },
    [measuredHeight],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      if (y <= 4) {
        // Always fully expanded once back near the top.
        progress.value = withTiming(0, { duration: 200 });
      } else if (dy > 4) {
        // Scrolling down a meaningful amount -> collapse.
        progress.value = withTiming(1, { duration: 200 });
      } else if (dy < -4) {
        // Scrolling up a meaningful amount -> reveal.
        progress.value = withTiming(0, { duration: 200 });
      }
      lastY.current = y;
    },
    [progress],
  );

  const collapsibleStyle = useAnimatedStyle(() => ({
    height: interpolate(
      progress.value,
      [0, 1],
      [measuredHeight.value, 0],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(progress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  return { onScroll, onLayout, collapsibleStyle };
}
