import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { VipBadge } from "@/src/components/Badges";
import { LanguagePair } from "@/src/components/LanguagePair";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, User } from "@/src/utils/api";

export default function Follows() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [active, setActive] = useState<"followers" | "following">(
    tab === "following" ? "following" : "followers",
  );
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: "followers" | "following") => {
    setLoading(true);
    try {
      const data = await api.get<User[]>(`/users/me/${which}`);
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(active);
  }, [active, load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="follows-screen">
      <View style={styles.header}>
        <Pressable
          testID="follows-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Connections</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.tabs}>
        {(["followers", "following"] as const).map((t) => (
          <Pressable
            key={t}
            testID={`follows-tab-${t}`}
            style={[styles.tab, active === t && styles.tabActive]}
            onPress={() => setActive(t)}
          >
            <Text style={[styles.tabText, active === t && styles.tabTextActive]}>
              {t === "followers" ? "Followers" : "Following"}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={colors.borderStrong} />
              <Text style={styles.emptyTitle}>
                {active === "followers" ? "No followers yet" : "Not following anyone"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`follow-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/user/${item.id}`)}
            >
              <Avatar
                name={item.name}
                url={item.avatar_url}
                size={50}
                flagCode={countryToCode(item.country)}
                online={item.is_online}
              />
              <View style={styles.rowInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {item.is_vip && <VipBadge small />}
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
    tabs: {
      flexDirection: "row",
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: "center",
      borderRadius: radius.pill,
    },
    tabActive: {
      backgroundColor: colors.brand,
    },
    tabText: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    tabTextActive: {
      color: colors.onBrand,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      minHeight: 300,
    },
    emptyTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 16,
      color: colors.onSurface,
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
    rowInfo: {
      flex: 1,
      gap: 4,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowName: {
      fontFamily: fonts.textBold,
      fontSize: 15,
      color: colors.onSurface,
    },
  });
