import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FlagIcon } from "@/src/components/FlagIcon";
import { langName } from "@/src/constants/languages";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";

interface LanguagePairProps {
  native?: string | null;
  /** Extra languages the user can teach besides their native one (max 2). */
  teach?: (string | null | undefined)[] | null;
  /** One learning language or a list of up to 3. */
  learning?: string | (string | null | undefined)[] | null;
  compact?: boolean;
}

export const LanguagePair: React.FC<LanguagePairProps> = ({
  native,
  teach,
  learning,
  compact,
}) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const teachList = [native, ...(teach || [])].filter(Boolean) as string[];
  const learnList = (
    Array.isArray(learning) ? learning : learning ? [learning] : []
  ).filter(Boolean) as string[];

  return (
    <View style={styles.row}>
      {teachList.map((code) => (
        <View key={`t-${code}`} style={[styles.chip, styles.nativeChip]}>
          <FlagIcon code={code} size={14} />
          <Text style={styles.chipText}>
            {compact ? code.toUpperCase() : langName(code)}
          </Text>
        </View>
      ))}
      <Ionicons
        name="swap-horizontal"
        size={14}
        color={colors.onSurfaceSecondary}
        style={{ marginHorizontal: spacing.xs }}
      />
      {learnList.slice(0, 3).map((code) => (
        <View key={`l-${code}`} style={[styles.chip, styles.learningChip]}>
          <FlagIcon code={code} size={14} />
          <Text style={[styles.chipText, styles.learningText]}>
            {compact ? code.toUpperCase() : langName(code)}
          </Text>
        </View>
      ))}
    </View>
  );
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 4,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    nativeChip: {
      backgroundColor: colors.brandTertiary,
    },
    learningChip: {
      backgroundColor: colors.surfaceSecondary,
    },
    chipText: {
      fontSize: 12,
      fontFamily: fonts.textBold,
      color: colors.onBrandTertiary,
    },
    learningText: {
      color: colors.onSurfaceSecondary,
    },
  });
