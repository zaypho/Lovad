import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
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
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { VipBadge } from "@/src/components/Badges";
import { FlagIcon } from "@/src/components/FlagIcon";
import { countryToCode } from "@/src/constants/countries";
import { LANGUAGES, PROFICIENCY_LEVELS, langName } from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useCollapsibleHeader } from "@/src/hooks/use-collapsible-header";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";
import { api, Conversation, User } from "@/src/utils/api";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "serious", label: "Serious Learners" },
  { key: "nearby", label: "Nearby" },
  { key: "city", label: "City" },
  { key: "gender", label: "Gender" },
];

export default function Connect() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [partners, setPartners] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("match");
  const [category, setCategory] = useState<string>("all");
  const [addLangOpen, setAddLangOpen] = useState(false);
  const [addingLang, setAddingLang] = useState(false);
  const [vipBusy, setVipBusy] = useState(false);
  const { onScroll, onLayout, collapsibleStyle } = useCollapsibleHeader();

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

  const ProfDots = ({ level }: { level?: string | null }) => {
    const idx = level ? PROFICIENCY_LEVELS.indexOf(level) : -1;
    const filled = idx >= 0 ? idx + 1 : 1;
    return (
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dot, i < filled && styles.dotFilled]} />
        ))}
      </View>
    );
  };
  const renderCard = ({ item }: { item: User }) => {
    const learning = (
      item.learning_languages?.length
        ? item.learning_languages
        : item.learning_language
          ? [item.learning_language]
          : []
    ).slice(0, 3);

    const isNew =
      item.created_at && dayjs().diff(dayjs(item.created_at), "day") < 7;
    const tags: { label: string; kind: "new" | "active" | "neutral" }[] = [];
    if (isNew) tags.push({ label: "New", kind: "new" });
    if (item.is_online) tags.push({ label: "Very active", kind: "active" });
    if (item.mbti) tags.push({ label: item.mbti, kind: "neutral" });
    if (
      user?.age &&
      item.age &&
      Math.abs(user.age - item.age) <= 5 &&
      tags.length < 3
    )
      tags.push({ label: "Similar age range", kind: "active" });

    const subtitle =
      item.bio?.trim() ||
      "Say hi first—don't miss the chance to meet a new language partner!";

    return (
      <Pressable
        testID={`partner-card-${item.id}`}
        style={styles.card}
        onPress={() => router.push(`/user/${item.id}`)}
      >
        <View style={styles.avatarCol}>
          <Avatar
            name={item.name}
            url={item.avatar_url}
            size={54}
            flagCode={countryToCode(item.country)}
            online={item.is_online}
            frame={item.active_frame}
          />
          <View style={styles.activeRow}>
            <View
              style={[
                styles.activeDot,
                { backgroundColor: item.is_online ? "#22C55E" : colors.borderStrong },
              ]}
            />
            <Text style={styles.activeText} numberOfLines={1}>
              {item.is_online ? "Active now" : "Recently"}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.is_vip && <VipBadge small tier={item.vip_tier} />}
          </View>

          <View style={styles.langRow}>
            <View style={styles.langItem}>
              <Text style={styles.langCode}>
                {(item.native_language || "").toUpperCase()}
              </Text>
              <View style={styles.langBar} />
            </View>
            <Ionicons
              name="swap-horizontal"
              size={13}
              color={colors.onSurfaceSecondary}
              style={{ marginHorizontal: 5 }}
            />
            {learning.map((c, i) => (
              <View key={c} style={[styles.langItem, { marginRight: spacing.sm }]}>
                <Text style={styles.langCode}>{c.toUpperCase()}</Text>
                <ProfDots
                  level={
                    item.proficiencies?.[c] || (i === 0 ? item.proficiency : null)
                  }
                />
              </View>
            ))}
          </View>

          <Text style={styles.cardSub} numberOfLines={2}>
            {subtitle}
          </Text>

          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((t) => (
                <View
                  key={t.label}
                  style={[
                    styles.tag,
                    t.kind === "new" && styles.tagNew,
                    t.kind === "active" && styles.tagActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      t.kind === "new" && styles.tagTextNew,
                      t.kind === "active" && styles.tagTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Pressable
          testID={`partner-message-btn-${item.id}`}
          style={styles.waveBtn}
          onPress={() => openChat(item)}
        >
          <Ionicons name="chatbubble" size={20} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="connect-screen">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect</Text>
        <View style={styles.headerActions}>
          <Pressable
            testID="connect-filter-btn"
            style={styles.headerIconBtn}
            onPress={() => router.push("/search")}
          >
            <Ionicons name="options-outline" size={19} color={colors.brand} />
          </Pressable>
        </View>
      </View>

      {/* Category tabs + language chips — collapse away on scroll down,
          reveal on scroll up. The title bar above never moves. */}
      <Animated.View style={[styles.collapsibleWrap, collapsibleStyle]}>
        <View onLayout={onLayout}>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRow}
            >
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    testID={`connect-cat-${c.key}`}
                    onPress={() => setCategory(c.key)}
                    style={[styles.catItem, active && styles.catItemActive]}
                  >
                    <Text style={[styles.catText, active && styles.catTextActive]}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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
                      style={[styles.filterText, active && styles.filterTextActive]}
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
                  <Ionicons name="add" size={18} color={colors.brand} />
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </Animated.View>

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
          onScroll={onScroll}
          scrollEventThrottle={16}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="earth-outline" size={56} color={colors.borderStrong} />
              <Text style={styles.emptyText}>
                No partners found. Try a different filter!
              </Text>
            </View>
          }
          renderItem={renderCard}
        />
      )}

      {/* Add language / VIP modal */}
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
                      <Text style={styles.vipBtnText}>Upgrade to VIP — Free</Text>
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
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    collapsibleWrap: {
      overflow: "hidden",
    },
    headerTitle: {
      fontFamily: fonts.display,
      fontSize: 22,
      color: colors.onSurface,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    headerIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
    },
    catRow: {
      gap: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    catItem: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
    },
    catItemActive: {
      backgroundColor: colors.surfaceSecondary,
    },
    catText: {
      fontFamily: fonts.textSemi,
      fontSize: 15,
      color: colors.onSurfaceSecondary,
    },
    catTextActive: {
      fontFamily: fonts.displaySemi,
      color: colors.onSurface,
    },
    filterRow: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    filterChipActive: {
      backgroundColor: colors.brandTertiary,
    },
    filterText: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    filterTextActive: {
      color: colors.brand,
    },
    addChip: {
      paddingHorizontal: spacing.xl,
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxxl,
    },
    sep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      marginVertical: spacing.lg,
    },
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    avatarCol: {
      alignItems: "center",
      width: 66,
      gap: 4,
    },
    activeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    activeDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    activeText: {
      fontFamily: fonts.text,
      fontSize: 10,
      color: colors.onSurfaceSecondary,
    },
    cardBody: {
      flex: 1,
      gap: 5,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    cardName: {
      fontFamily: fonts.display,
      fontSize: 18,
      color: colors.onSurface,
      flexShrink: 1,
    },
    langRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    langItem: {
      alignItems: "flex-start",
    },
    langCode: {
      fontFamily: fonts.textBold,
      fontSize: 10.5,
      color: colors.onSurface,
    },
    langBar: {
      width: "100%",
      height: 2.5,
      borderRadius: 2,
      backgroundColor: colors.success,
      marginTop: 2,
    },
    dotsRow: {
      flexDirection: "row",
      gap: 2,
      marginTop: 3,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceTertiary,
    },
    dotFilled: {
      backgroundColor: colors.brand,
    },
    cardSub: {
      fontFamily: fonts.text,
      fontSize: 13,
      lineHeight: 19,
      color: colors.onSurfaceSecondary,
    },
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: 2,
    },
    tag: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
    },
    tagNew: {
      backgroundColor: "#CCFBF1",
    },
    tagActive: {
      backgroundColor: "#FFEDD5",
    },
    tagText: {
      fontFamily: fonts.textSemi,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
    },
    tagTextNew: {
      color: "#0D9488",
    },
    tagTextActive: {
      color: "#EA580C",
    },
    waveBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 5,
      marginLeft: -4,
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
