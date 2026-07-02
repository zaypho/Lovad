import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { useChatSocket } from "@/src/hooks/use-chat-socket";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";
import { api, Conversation } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

export default function Chats() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Conversation[]>("/chats");
      setConversations(data);
    } catch {
      // keep previous list on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useChatSocket(
    useCallback(
      (event) => {
        if (event.type === "new_message") load();
      },
      [load],
    ),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="chats-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            conversations.length === 0 ? { flex: 1 } : styles.list
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="chatbubbles-outline"
                size={56}
                color={colors.borderStrong}
              />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyText}>
                Find a partner and say hello!
              </Text>
              <Pressable
                testID="chats-find-partners-btn"
                style={styles.findBtn}
                onPress={() => router.push("/(tabs)/connect")}
              >
                <Text style={styles.findBtnText}>Find Partners</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`chat-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/chat/${item.id}`)}
            >
              <Avatar
                name={item.partner?.name}
                url={item.partner?.avatar_url}
                size={54}
                flagCode={countryToCode(item.partner?.country)}
                online={item.partner?.is_online}
              />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.partner?.name || "Unknown"}
                  </Text>
                  <Text style={styles.rowTime}>
                    {timeAgo(item.last_message?.created_at)}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.rowSnippet} numberOfLines={1}>
                    {item.last_message?.text || "Say hello 👋"}
                  </Text>
                  {item.unread > 0 && (
                    <View style={styles.badge} testID={`chat-unread-${item.id}`}>
                      <Text style={styles.badgeText}>{item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.onSurface,
  },
  list: {
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  rowBody: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowName: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: colors.onSurface,
    flexShrink: 1,
  },
  rowTime: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowSnippet: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    color: colors.onBrand,
    fontFamily: fonts.textBold,
    fontSize: 11,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fonts.displaySemi,
    fontSize: 18,
    color: colors.onSurface,
    marginTop: spacing.md,
  },
  emptyText: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
  findBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  findBtnText: {
    color: colors.onBrand,
    fontFamily: fonts.textBold,
    fontSize: 15,
  },
});
