import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { VipBadge } from "@/src/components/Badges";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { useChatSocket } from "@/src/hooks/use-chat-socket";
import { useCollapsibleHeader } from "@/src/hooks/use-collapsible-header";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";
import { api, Conversation } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

interface Shortcut {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: "courses", label: "All Courses", icon: "book", color: "#3B82F6" },
  { key: "play", label: "Play", icon: "game-controller", color: "#22C55E" },
  {
    key: "translate",
    label: "AI Translation",
    icon: "language",
    color: "#14B8A6",
    route: "/translate",
  },
  { key: "voice", label: "Voiceroom", icon: "mic", color: "#8B5CF6" },
  { key: "more", label: "More", icon: "chevron-down", color: "#9CA3AF" },
];

export default function Chats() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const { onScroll, onLayout, collapsibleStyle } = useCollapsibleHeader();

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.partner?.name || "").toLowerCase();
      const snippet = (c.last_message?.text || "").toLowerCase();
      return name.includes(q) || snippet.includes(q);
    });
  }, [conversations, query]);

  const onShortcut = (s: Shortcut) => {
    if (s.route) router.push(s.route as never);
  };

  const listHeader = (
    <View onLayout={onLayout}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shortcutRow}
      >
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.key}
            testID={`chats-shortcut-${s.key}`}
            style={styles.shortcut}
            onPress={() => onShortcut(s)}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: s.color }]}>
              <Ionicons name={s.icon} size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="chats-search-input"
          style={styles.searchInput}
          placeholder="Search"
          placeholderTextColor={colors.onSurfaceSecondary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable
            testID="chats-search-clear"
            onPress={() => setQuery("")}
            hitSlop={8}
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.onSurfaceSecondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="chats-screen">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <Pressable
          testID="chats-add-btn"
          style={styles.headerIconBtn}
          onPress={() => router.push("/(tabs)/connect")}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Shortcuts + search — collapse away on scroll down, reveal on
          scroll up. The title bar above never moves. */}
      <Animated.View style={[styles.collapsibleWrap, collapsibleStyle]}>
        {listHeader}
      </Animated.View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="chatbubbles-outline"
                size={56}
                color={colors.borderStrong}
              />
              <Text style={styles.emptyTitle}>
                {query ? "No matches" : "No chats yet"}
              </Text>
              <Text style={styles.emptyText}>
                {query
                  ? "Try a different search."
                  : "Find a partner and say hello!"}
              </Text>
              {!query && (
                <Pressable
                  testID="chats-find-partners-btn"
                  style={styles.findBtn}
                  onPress={() => router.push("/(tabs)/connect")}
                >
                  <Text style={styles.findBtnText}>Find Partners</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`chat-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/chat/${item.id}`)}
            >
              <View>
                <Avatar
                  name={item.partner?.name}
                  url={item.partner?.avatar_url}
                  size={54}
                  flagCode={countryToCode(item.partner?.country)}
                  online={item.partner?.is_online}
                  frame={item.partner?.active_frame}
                />
                {item.partner?.in_voice_room ? (
                  <View
                    style={styles.roomBadge}
                    testID={`chat-room-badge-${item.id}`}
                  >
                    <Ionicons name="mic" size={10} color="#FFF" />
                  </View>
                ) : null}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <View style={styles.nameWrap}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.partner?.name || "Unknown"}
                    </Text>
                    {item.partner?.active_badge?.emoji ? (
                      <Text style={{ fontSize: 12 }}>
                        {item.partner.active_badge.emoji}
                      </Text>
                    ) : null}
                    {item.partner?.is_vip ? (
                      <VipBadge small tier={item.partner?.vip_tier} />
                    ) : null}
                  </View>
                  <Text style={styles.rowTime}>
                    {timeAgo(item.last_message?.created_at)}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  {item.partner?.in_voice_room ? (
                    <Text style={styles.roomStatus} numberOfLines={1}>
                      🎙️ In voice room
                      {item.partner.in_voice_room.name
                        ? ` · ${item.partner.in_voice_room.name}`
                        : ""}
                    </Text>
                  ) : (
                    <Text style={styles.rowSnippet} numberOfLines={1}>
                      {item.last_message?.text || "Say hello 👋"}
                    </Text>
                  )}
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
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
    },
    collapsibleWrap: {
      overflow: "hidden",
    },
    headerIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    headerTitle: {
      flex: 1,
      textAlign: "left",
      fontFamily: fonts.display,
      fontSize: 22,
      color: colors.onSurface,
    },
    shortcutRow: {
      gap: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    shortcut: {
      alignItems: "center",
      width: 56,
      gap: 6,
    },
    shortcutIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
    },
    shortcutLabel: {
      fontFamily: fonts.textSemi,
      fontSize: 11,
      color: colors.onSurfaceSecondary,
      textAlign: "center",
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      height: 40,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.text,
      fontSize: 15,
      color: colors.onSurface,
      padding: 0,
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
    nameWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    roomBadge: {
      position: "absolute",
      top: -3,
      left: -3,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: "#8B5CF6",
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    roomStatus: {
      flex: 1,
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: "#8B5CF6",
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
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.xl,
      paddingTop: spacing.xxxl,
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
