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
import { LanguagePair } from "@/src/components/LanguagePair";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, Visitor } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

export default function Visitors() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ count: number; visitors: Visitor[] }>("/users/me/visitors")
      .then((d) => setVisitors(d.visitors))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="visitors-screen">
      <View style={styles.header}>
        <Pressable
          testID="visitors-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile Views</Text>
        <View style={{ width: 40 }} />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={visitors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="eye-off-outline" size={48} color={colors.borderStrong} />
              <Text style={styles.emptyTitle}>No visitors yet</Text>
              <Text style={styles.emptySub}>
                When partners visit your profile, they will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`visitor-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/user/${item.id}`)}
            >
              <Avatar
                name={item.name}
                url={item.avatar_url}
                size={52}
                flagCode={countryToCode(item.country)}
                online={item.is_online}
              />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
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
              <View style={styles.rowRight}>
                <Text style={styles.rowTime}>{timeAgo(item.visited_at)}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.onSurfaceSecondary}
                />
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
    rowInfo: {
      flex: 1,
      gap: 4,
    },
    rowName: {
      fontFamily: fonts.textBold,
      fontSize: 15,
      color: colors.onSurface,
    },
    rowRight: {
      alignItems: "flex-end",
      gap: 4,
    },
    rowTime: {
      fontFamily: fonts.text,
      fontSize: 11,
      color: colors.onSurfaceSecondary,
    },
  });
