import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/src/theme";

/** Small ♂ / ♀ symbol shown next to user names. */
export const GenderBadge: React.FC<{
  gender?: "male" | "female" | null;
  size?: number;
}> = ({ gender, size = 13 }) => {
  if (!gender) return null;
  const male = gender === "male";
  return (
    <View
      style={[
        styles.genderWrap,
        {
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          backgroundColor: male ? "rgba(59,130,246,0.15)" : "rgba(236,72,153,0.15)",
        },
      ]}
    >
      <Ionicons
        name={male ? "male" : "female"}
        size={size}
        color={male ? "#3B82F6" : "#EC4899"}
      />
    </View>
  );
};

/** Gold VIP pill shown next to VIP users' names. */
export const VipBadge: React.FC<{ small?: boolean }> = ({ small }) => (
  <View style={[styles.vipWrap, small && styles.vipWrapSmall]}>
    <Text style={[styles.vipText, small && styles.vipTextSmall]}>VIP</Text>
  </View>
);

const styles = StyleSheet.create({
  genderWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  vipWrap: {
    backgroundColor: "#F59E0B",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  vipWrapSmall: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  vipText: {
    color: "#FFFFFF",
    fontFamily: fonts.textBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  vipTextSmall: {
    fontSize: 8,
  },
});
