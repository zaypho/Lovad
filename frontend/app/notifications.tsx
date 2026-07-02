import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, AppNotification } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

const TYPE_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  like: { icon: "heart", color: "#EF4444", label: "liked your moment" },
  comment: { icon: "chatbubble", color: "#0EA5E9", label: "commented on your moment" },
  reply: { icon: "return-down-forward", color: "#8B5CF6", label: "replied to your comment" },
};

export default function Notifications() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ unread: number; notifications: AppNotification[] }>("/notifications")
      .then((d) => setItems(d.notifications))
      .finally(() => {
        setLoading(false);
        api.post("/notifications/read").catch(() => {});
      });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="notifications-screen">
      <View style={styles.header}>
        <Pressable
          testID="notifications-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="notifications-off-outline"
                size={48}
                color={colors.borderStrong}
              />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>
                Likes, comments and replies on your moments will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type] || TYPE_META.comment;
            return (
              <Pressable
                testID={`notification-row-${item.id}`}
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() =>
                  item.moment_id && router.push(`/moment/${item.moment_id}`)
                }
              >
                <View>
                  <Avatar
                    name={item.actor?.name}
                    url={item.actor?.avatar_url}
                    size={46}
                    flagCode={countryToCode(item.actor?.country)}
                  />
                  <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
                    <Ionicons name={meta.icon} size={10} color="#FFF" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>
                    <Text style={styles.rowName}>{item.actor?.name || "Someone"}</Text>{" "}
                    {meta.label}
                  </Text>
                  {item.text ? (
                    <Text style={styles.rowSnippet} numberOfLines={1}>
                      “{item.text}”
                    </Text>
                  ) : null}
                  <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.read && <View style={styles.unreadDot} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontFamily: fonts.display,
      fontSize: 18,
      color: colors.onSurface,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      minHeight: 300,
      paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 16,
      color: colors.onSurface,
    },
    emptySub: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
      textAlign: "center",
    },
    list: {
      padding: spacing.lg,
      gap: spacing.sm,
      flexGrow: 1,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      ...shadow.card,
    },
    rowUnread: {
      borderLeftWidth: 3,
      borderLeftColor: colors.brand,
    },
    typeBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surface,
    },
    rowText: {
      fontFamily: fonts.text,
      fontSize: 14,
      color: colors.onSurface,
    },
    rowName: {
      fontFamily: fonts.textBold,
    },
    rowSnippet: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
      marginTop: 1,
    },
    rowTime: {
      fontFamily: fonts.text,
      fontSize: 11,
      color: colors.onSurfaceSecondary,
      marginTop: 2,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.brand,
    },
  });
