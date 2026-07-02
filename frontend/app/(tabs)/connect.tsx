import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { FlagIcon } from "@/src/components/FlagIcon";
import { LanguagePair } from "@/src/components/LanguagePair";
import { countryToCode } from "@/src/constants/countries";
import { langName } from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, Conversation, User } from "@/src/utils/api";

export default function Connect() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [partners, setPartners] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("match");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== "match") params.set("language", filter);
      if (search.trim()) params.set("search", search.trim());
      const qs = params.toString();
      const data = await api.get<User[]>(`/users/partners${qs ? `?${qs}` : ""}`);
      setPartners(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const openChat = async (partner: User) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const conv = await api.post<Conversation>("/chats", {
        partner_id: partner.id,
      });
      router.push(`/chat/${conv.id}`);
    } catch {
      // navigation failed silently is acceptable; partner card remains
    }
  };

  const myLearning = (
    user?.learning_languages?.length
      ? user.learning_languages
      : user?.learning_language
        ? [user.learning_language]
        : []
  ).slice(0, 3);

  const filterChips = [
    { key: "match", label: "Best Match" },
    ...myLearning.map((c) => ({ key: c, label: langName(c) })),
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="connect-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect</Text>
        <Text style={styles.headerSub}>
          {myLearning.length
            ? `Partners for your ${myLearning.map((c) => langName(c)).join(", ")} journey`
            : "Find language partners"}
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="connect-search-input"
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor={colors.onSurfaceSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filterChips.map((chip) => {
            const active = filter === chip.key;
            return (
              <Pressable
                key={chip.key}
                testID={`connect-filter-${chip.key}`}
                onPress={() => setFilter(chip.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                {chip.key !== "match" && <FlagIcon code={chip.key} size={14} />}
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable testID="connect-retry-btn" onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="earth-outline"
                size={56}
                color={colors.borderStrong}
              />
              <Text style={styles.emptyText}>
                No partners found. Try a different filter!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`partner-card-${item.id}`}
              style={styles.card}
              onPress={() => router.push(`/user/${item.id}`)}
            >
              <Avatar
                name={item.name}
                url={item.avatar_url}
                size={56}
                flagCode={countryToCode(item.country)}
                online={item.is_online}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <LanguagePair
                  native={item.native_language}
                  teach={item.teach_languages}
                  learning={
                    item.learning_languages?.length
                      ? item.learning_languages
                      : item.learning_language
                  }
                  compact
                />
                {item.bio ? (
                  <Text style={styles.cardBio} numberOfLines={2}>
                    {item.bio}
                  </Text>
                ) : null}
              </View>
              <View style={styles.cardRight}>
                <Pressable
                  testID={`partner-message-btn-${item.id}`}
                  style={styles.msgBtn}
                  onPress={() => openChat(item)}
                >
                  <Ionicons name="chatbubble" size={18} color={colors.onBrand} />
                </Pressable>
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
    backgroundColor: colors.surfaceSecondary,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.onSurface,
  },
  headerSub: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: spacing.xs,
  },
  filterRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.brand,
  },
  filterText: {
    fontFamily: fonts.textBold,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  filterTextActive: {
    color: colors.onBrand,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: "center",
    ...shadow.card,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardName: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: colors.onSurface,
    flexShrink: 1,
  },
  cardRight: {
    alignItems: "center",
    gap: spacing.xs,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cardBio: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  msgBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyText: {
    fontFamily: fonts.textSemi,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryText: {
    color: colors.onBrand,
    fontFamily: fonts.textBold,
  },
});
