import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { countryFlagUrl } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts } from "@/src/theme";
import { assetUrl } from "@/src/utils/api";

export interface AvatarFrame {
  color: string;
  colors?: string[] | null;
  animated?: boolean;
}

/** Animated avatar ring: cycles colors (animated frames) and/or pulses (speaking). */
const AnimatedRing: React.FC<{
  size: number;
  gap: number;
  width: number;
  colors: string[];
  pulse?: boolean;
  testID?: string;
}> = ({ size, gap, width, colors, pulse, testID }) => {
  const t = useSharedValue(0);

  React.useEffect(() => {
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, {
        duration: pulse ? 800 : 1800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [t, pulse]);

  const palette = colors.length > 1 ? colors : [colors[0], colors[0]];
  const stops = palette.map((_, i) => i / (palette.length - 1));

  const animStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(t.value, stops, palette),
    transform: [{ scale: pulse ? 1 + t.value * 0.08 : 1 }],
    opacity: pulse ? 1 - t.value * 0.3 : 1,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[
        {
          position: "absolute",
          top: -gap,
          left: -gap,
          right: -gap,
          bottom: -gap,
          borderRadius: (size + gap * 2) / 2,
          borderWidth: width,
        },
        animStyle,
      ]}
    />
  );
};

interface AvatarProps {
  name?: string | null;
  url?: string | null;
  size?: number;
  testID?: string;
  /** ISO-2 country code (e.g. "cn"). When provided, a round flag badge is
   *  rendered at the bottom-right of the avatar (HelloTalk style). */
  flagCode?: string | null;
  /** Shows a green presence dot at the top-right when true. */
  online?: boolean;
  /** Ring around the avatar (marketplace frame). Animated frames cycle colors. */
  frame?: AvatarFrame | null;
  /** Green "active speaker" pulsing ring (voice rooms). Takes priority over frame. */
  isSpeaking?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  url,
  size = 48,
  testID,
  flagCode,
  online,
  frameColor,
  isSpeaking,
}) => {
  const { colors } = useTheme();
  const baseStyle = { width: size, height: size, borderRadius: size / 2 };
  const flagSize = Math.max(14, Math.round(size * 0.34));
  const flagBorder = Math.max(1, Math.round(size * 0.04));
  const resolvedUrl = assetUrl(url);

  const content = resolvedUrl ? (
    <Image
      testID={testID}
      source={{ uri: resolvedUrl }}
      style={baseStyle}
      contentFit="cover"
      transition={150}
    />
  ) : (
    <View
      testID={testID}
      style={[
        baseStyle,
        {
          backgroundColor: colors.brandTertiary,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Text
        style={{
          color: colors.onBrandTertiary,
          fontFamily: fonts.displaySemi,
          fontSize: size * 0.38,
        }}
      >
        {(name || "?")
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()}
      </Text>
    </View>
  );

  const ringColors = isSpeaking
    ? ["#22C55E", "#86EFAC"]
    : frame
      ? frame.animated && frame.colors?.length
        ? frame.colors
        : [frame.color]
      : null;
  const ringAnimated = isSpeaking || !!frame?.animated;

  if (!flagCode && !online && !ringColors) return content;

  const dotSize = Math.max(9, Math.round(size * 0.22));
  const ringWidth = Math.max(2, Math.round(size * 0.05));
  const ringGap = ringWidth + 1;

  return (
    <View style={[styles.wrap, baseStyle]}>
      {content}
      {ringColors ? (
        ringAnimated ? (
          <AnimatedRing
            testID={testID ? `${testID}-ring` : undefined}
            size={size}
            gap={ringGap}
            width={ringWidth}
            colors={ringColors}
            pulse={isSpeaking}
          />
        ) : (
          <View
            pointerEvents="none"
            testID={testID ? `${testID}-ring` : undefined}
            style={{
              position: "absolute",
              top: -ringGap,
              left: -ringGap,
              right: -ringGap,
              bottom: -ringGap,
              borderRadius: (size + ringGap * 2) / 2,
              borderWidth: ringWidth,
              borderColor: ringColors[0],
            }}
          />
        )
      ) : null}
      {flagCode ? (
        <Image
          testID={testID ? `${testID}-flag` : undefined}
          source={{ uri: countryFlagUrl(flagCode) }}
          style={{
            position: "absolute",
            left: -flagBorder,
            bottom: -flagBorder,
            width: flagSize,
            height: flagSize,
            borderRadius: flagSize / 2,
            borderWidth: flagBorder,
            borderColor: colors.surface,
            backgroundColor: colors.surface,
          }}
          contentFit="cover"
          transition={100}
        />
      ) : null}
      {online ? (
        <View
          testID={testID ? `${testID}-online` : undefined}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: "#22C55E",
            borderWidth: flagBorder,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
});
