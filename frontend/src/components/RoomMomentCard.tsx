import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FlagIcon } from "@/src/components/FlagIcon";
import { SpeakingBars } from "@/src/components/SpeakingBars";
import { langName } from "@/src/constants/languages";
import { fonts, radius, spacing } from "@/src/theme";
import { RoomCardInfo } from "@/src/utils/api";

/**
 * Rich "live voice room" card used both in the Moments feed and the single
 * moment detail page — same visuals everywhere: colorful gradient, a live
 * sound-wave animation while the room is ongoing, and a "Room ended" state
 * once the host closes it (no longer tappable).
 */
export const RoomMomentCard = ({
  room,
  onPress,
  testID,
}: {
  room: RoomCardInfo;
  onPress: () => void;
  testID?: string;
}) => (
  <Pressable testID={testID} disabled={!room.is_live} onPress={onPress}>
    <LinearGradient
      colors={room.is_live ? ["#6D5AE8", "#4B3F87"] : ["#9CA3AF", "#6B7280"]}
      style={styles.card}
    >
      <View style={styles.top}>
        {room.is_live ? (
          <View style={styles.liveBadge}>
            <SpeakingBars />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : (
          <View style={styles.liveBadge}>
            <Ionicons name="mic-off" size={11} color="#FFFFFF" />
            <Text style={styles.liveText}>ROOM ENDED</Text>
          </View>
        )}
        {room.language ? (
          <View style={styles.langBadge}>
            <FlagIcon code={room.language} size={11} />
            <Text style={styles.langText}>{langName(room.language)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {room.title || "Voice room"}
      </Text>
      <View style={styles.bottom}>
        <Ionicons name="people" size={13} color="rgba(255,255,255,0.85)" />
        <Text style={styles.members}>
          {room.member_count || 0} {room.is_live ? "listening now" : "were in this room"}
        </Text>
        {room.is_live && (
          <View style={styles.joinBtn}>
            <Text style={styles.joinText}>Join</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  liveText: {
    fontFamily: fonts.textBold,
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.6,
  },
  langBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  langText: {
    fontFamily: fonts.textBold,
    fontSize: 10,
    color: "#FFFFFF",
  },
  title: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  members: {
    flex: 1,
    fontFamily: fonts.textSemi,
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
  },
  joinBtn: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  joinText: {
    fontFamily: fonts.textBold,
    fontSize: 12,
    color: "#4B3F87",
  },
});
