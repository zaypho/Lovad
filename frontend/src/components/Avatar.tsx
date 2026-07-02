import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { countryFlagUrl } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts } from "@/src/theme";
import { assetUrl } from "@/src/utils/api";

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
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  url,
  size = 48,
  testID,
  flagCode,
  online,
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

  if (!flagCode && !online) return content;

  const dotSize = Math.max(10, Math.round(size * 0.26));

  return (
    <View style={[styles.wrap, baseStyle]}>
      {content}
      {flagCode ? (
        <Image
          testID={testID ? `${testID}-flag` : undefined}
          source={{ uri: countryFlagUrl(flagCode) }}
          style={{
            position: "absolute",
            right: -flagBorder,
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
            top: 0,
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
