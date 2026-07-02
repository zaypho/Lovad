import { Ionicons } from "@expo/vector-icons";
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
import { GenderBadge, VipBadge } from "@/src/components/Badges";
import { FlagIcon } from "@/src/components/FlagIcon";
import { LanguagePair } from "@/src/components/LanguagePair";
import { countryToCode } from "@/src/constants/countries";
import { LANGUAGES } from "@/src/constants/languages";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, User } from "@/src/utils/api";

export default function Search() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [native, setNative] = useState<string | null>(null);
  const [learning, setLearning] = useState<string | null>(null);
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (native) params.set("native", native);
      if (learning) params.set("learning", learning);
      if (gender) params.set("gender", gender);
      if (onlineOnly) params.set("online_only", "true");
      if (!params.toString()) params.set("language", "all");
      const data = await api.get<User[]>(`/users/partners?${params.toString()}`);
      setResults(data);
    } catch {
      // keep previous results
    } finally {
      setLoading(false);
    }
  }, [query, native, learning, gender, onlineOnly]);

  useEffect(() => {
    const t = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const langChips = (
    selected: string | null,
    onSelect: (c: string | null) => void,
    prefix: string,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      <Pressable
        testID={`${prefix}-any`}
        onPress={() => onSelect(null)}
        style={[styles.chip, !selected && styles.chipActive]}
      >
        <Text style={[styles.chipText, !selected && styles.chipTextActive]}>
          Any
        </Text>
      </Pressable>
      {LANGUAGES.map((l) => {
        const active = selected === l.code;
        return (
          <Pressable
            key={l.code}
            testID={`${prefix}-${l.code}`}
            onPress={() => onSelect(active ? null : l.code)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <FlagIcon code={l.code} size={13} />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {l.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="search-screen">
      <View style={styles.header}>
        <Pressable
          testID="search-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={colors.onSurfaceSecondary} />
          <TextInput
            testID="search-input"
            style={styles.searchInput}
            placeholder="Search by name..."
            placeholderTextColor={colors.onSurfaceSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 && (
            <Pressable
              testID="search-clear-btn"
              onPress={() => setQuery("")}
              hitSlop={6}
            >
              <Ionicons
                name="close-circle"
                size={17}
                color={colors.onSurfaceSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.filterLabel}>Native language</Text>
      {langChips(native, setNative, "search-native")}
      <Text style={styles.filterLabel}>Learning language</Text>
      {langChips(learning, setLearning, "search-learning")}
      <View style={styles.togglesRow}>
        {(["male", "female"] as const).map((g) => (
          <Pressable
            key={g}
            testID={`search-gender-${g}`}
            onPress={() => setGender(gender === g ? null : g)}
            style={[styles.chip, gender === g && styles.chipActive]}
          >
            <Ionicons
              name={g}
              size={13}
              color={gender === g ? colors.onBrandTertiary : colors.onSurfaceTertiary}
            />
            <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>
              {g === "male" ? "Male" : "Female"}
            </Text>
          </Pressable>
        ))}
        <Pressable
          testID="search-online-toggle"
          onPress={() => setOnlineOnly(!onlineOnly)}
          style={[styles.chip, onlineOnly && styles.chipActive]}
        >
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: onlineOnly ? "#22C55E" : colors.borderStrong },
            ]}
          />
          <Text style={[styles.chipText, onlineOnly && styles.chipTextActive]}>
            Online
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="search-outline"
                size={48}
                color={colors.borderStrong}
              />
              <Text style={styles.emptyText}>
                No users found. Try different filters!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`search-result-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/user/${item.id}`)}
            >
              <Avatar
                name={item.name}
                url={item.avatar_url}
                size={48}
                flagCode={countryToCode(item.country)}
                online={item.is_online}
                frame={item.active_frame}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
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
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.onSurfaceSecondary}
              />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surfaceSecondary },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    searchBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      ...shadow.card,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.text,
      fontSize: 15,
      color: colors.onSurface,
      paddingVertical: 2,
    },
    filterLabel: {
      fontFamily: fonts.textBold,
      fontSize: 11,
      color: colors.onSurfaceSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    chipRow: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    togglesRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      ...shadow.card,
    },
    chipActive: { backgroundColor: colors.brandTertiary },
    chipText: {
      fontFamily: fonts.textSemi,
      fontSize: 12,
      color: colors.onSurfaceTertiary,
    },
    chipTextActive: {
      color: colors.onBrandTertiary,
      fontFamily: fonts.textBold,
    },
    onlineDot: { width: 8, height: 8, borderRadius: 4 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      padding: spacing.xl,
      minHeight: 200,
    },
    emptyText: {
      fontFamily: fonts.textSemi,
      fontSize: 14,
      color: colors.onSurfaceSecondary,
      textAlign: "center",
    },
    list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      ...shadow.card,
    },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: {
      fontFamily: fonts.displaySemi,
      fontSize: 15,
      color: colors.onSurface,
      flexShrink: 1,
    },
  });
