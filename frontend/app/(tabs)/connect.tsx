import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { GenderBadge, VipBadge } from "@/src/components/Badges";
import { FlagIcon } from "@/src/components/FlagIcon";
import { LanguagePair } from "@/src/components/LanguagePair";
import { countryToCode } from "@/src/constants/countries";
import { LANGUAGES, langName } from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, Conversation, User } from "@/src/utils/api";

export default function Connect() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [partners, setPartners] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("match");
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== "match") params.set("language", filter);
      const qs = params.toString();
      const data = await api.get<User[]>(`/users/partners${qs ? `?${qs}` : ""}`);
      setPartners(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const openChat = async (partner: User) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const conv = await api.post<Conversation>("/chats", {
        partner_id: partner.id,
      });
      router.push(`/chat/${conv.id}`);
    } catch (e) {
      Alert.alert(
        "Message limit",
        e instanceof Error ? e.message : "Could not start the chat.",
      );
    }
  };

  const [addLangOpen, setAddLangOpen] = useState(false);
  const [addingLang, setAddingLang] = useState(false);
  const [vipBusy, setVipBusy] = useState(false);

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

  const needsVipForMore = !user?.is_vip && myLearning.length >= 1;

  const addLanguage = async (code: string) => {
    if (addingLang) return;
    setAddingLang(true);
    try {
      const next = [...myLearning, code].slice(0, 3);
      const updated = await api.put<User>("/users/me", {
        learning_languages: next,
        learning_language: next[0],
      });
      setUser(updated);
      setAddLangOpen(false);
    } catch {
      Alert.alert("Language", "Could not add the language. Try again.");
    } finally {
      setAddingLang(false);
    }
  };

  const upgradeVip = async () => {
    if (vipBusy) return;
    setVipBusy(true);
    try {
      const updated = await api.post<User>("/users/me/vip");
      setUser(updated);
    } catch {
      Alert.alert("VIP", "Could not upgrade. Try again.");
    } finally {
      setVipBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="connect-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Connect</Text>
          <Text style={styles.headerSub}>
            {myLearning.length
              ? `Partners for your ${myLearning.map((c) => langName(c)).join(", ")} journey`
              : "Find language partners"}
          </Text>
        </View>
        {scrolled && (
          <Pressable
            testID="connect-search-topbar-btn"
            style={styles.searchIconBtn}
            onPress={() => router.push("/search")}
          >
            <Ionicons name="search" size={20} color={colors.brand} />
          </Pressable>
        )}
      </View>

      {!scrolled && (
        <Pressable
          testID="connect-search-bar"
          style={styles.searchBox}
          onPress={() => router.push("/search")}
        >
          <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
          <Text style={styles.searchPlaceholder}>
            Search partners by name, language...
          </Text>
        </Pressable>
      )}

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
          {myLearning.length < 3 && (
            <Pressable
              testID="connect-add-language-btn"
              onPress={() => setAddLangOpen(true)}
              style={[styles.filterChip, styles.addChip]}
            >
              <Ionicons name="add" size={16} color={colors.brand} />
            </Pressable>
          )}
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
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 40)}
          scrollEventThrottle={16}
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
                frame={item.active_frame}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <GenderBadge gender={item.gender} size={11} />
                  {item.is_vip && <VipBadge small tier={item.vip_tier} />}
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

      <Modal
        visible={addLangOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddLangOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {needsVipForMore ? "VIP Feature" : "Add a learning language"}
              </Text>
              <Pressable
                testID="add-lang-close-btn"
                onPress={() => setAddLangOpen(false)}
              >
                <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            {needsVipForMore ? (
              <View style={{ gap: spacing.lg }}>
                <Text style={styles.vipUpsellText}>
                  💎 Free members can learn 1 language. Upgrade to VIP to learn
                  up to 3 languages, chat without limits and get a VIP badge!
                </Text>
                <Pressable
                  testID="connect-vip-upgrade-btn"
                  style={styles.vipBtn}
                  onPress={upgradeVip}
                  disabled={vipBusy}
                >
                  {vipBusy ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="diamond" size={18} color="#FFF" />
                      <Text style={styles.vipBtnText}>
                        Upgrade to VIP — Free
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                <View style={styles.langGrid}>
                  {LANGUAGES.filter(
                    (l) =>
                      l.code !== user?.native_language &&
                      !(user?.teach_languages || []).includes(l.code) &&
                      !myLearning.includes(l.code),
                  ).map((lang) => (
                    <Pressable
                      key={lang.code}
                      testID={`add-lang-${lang.code}`}
                      onPress={() => addLanguage(lang.code)}
                      disabled={addingLang}
                      style={styles.langOption}
                    >
                      <FlagIcon code={lang.code} size={18} />
                      <Text style={styles.langOptionText}>{lang.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  addChip: {
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderStyle: "dashed",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.onSurface,
  },
  vipUpsellText: {
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceTertiary,
  },
  vipBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#F59E0B",
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
  },
  vipBtnText: {
    fontFamily: fonts.textBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  langGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  langOptionText: {
    fontFamily: fonts.textSemi,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
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
