import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { FlagIcon } from "@/src/components/FlagIcon";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, Moment } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

export default function Moments() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Moment[]>("/moments");
      setMoments(data);
    } catch {
      // keep previous feed on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleLike = async (moment: Moment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoments((prev) =>
      prev.map((m) =>
        m.id === moment.id
          ? {
              ...m,
              liked_by_me: !m.liked_by_me,
              like_count: m.like_count + (m.liked_by_me ? -1 : 1),
            }
          : m,
      ),
    );
    try {
      await api.post(`/moments/${moment.id}/like`);
    } catch {
      load();
    }
  };

  const publish = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await api.post("/moments", { text: draft.trim() });
      setDraft("");
      setComposerOpen(false);
      load();
    } catch {
      // keep modal open so user can retry
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="moments-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Moments</Text>
        <Text style={styles.headerSub}>What the community is saying</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="sparkles-outline" size={56} color={colors.borderStrong} />
              <Text style={styles.emptyText}>Share your first moment!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`moment-card-${item.id}`}
              style={styles.card}
              onPress={() => router.push(`/moment/${item.id}`)}
            >
              <View style={styles.cardHeader}>
                <Avatar
                  name={item.author?.name}
                  url={item.author?.avatar_url}
                  size={42}
                  flagCode={countryToCode(item.author?.country)}
                  online={item.author?.is_online}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.authorRow}>
                    <Text style={styles.authorName}>
                      {item.author?.name || "Unknown"}
                    </Text>
                    <FlagIcon code={item.author?.native_language} size={14} />
                    <Ionicons
                      name="arrow-forward"
                      size={10}
                      color={colors.onSurfaceSecondary}
                    />
                    {(item.author?.learning_languages?.length
                      ? item.author.learning_languages
                      : item.author?.learning_language
                        ? [item.author.learning_language]
                        : []
                    )
                      .slice(0, 3)
                      .map((c) => (
                        <FlagIcon key={c} code={c} size={14} />
                      ))}
                  </View>
                  <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
              <Text style={styles.cardText}>{item.text}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  testID={`moment-like-btn-${item.id}`}
                  style={styles.actionBtn}
                  onPress={() => toggleLike(item)}
                >
                  <Ionicons
                    name={item.liked_by_me ? "heart" : "heart-outline"}
                    size={20}
                    color={item.liked_by_me ? colors.error : colors.onSurfaceSecondary}
                  />
                  <Text style={styles.actionText}>{item.like_count}</Text>
                </Pressable>
                <Pressable
                  testID={`moment-comment-btn-${item.id}`}
                  style={styles.actionBtn}
                  onPress={() => router.push(`/moment/${item.id}`)}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={18}
                    color={colors.onSurfaceSecondary}
                  />
                  <Text style={styles.actionText}>{item.comment_count}</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable
        testID="moment-create-fab"
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
      >
        <Ionicons name="create" size={24} color={colors.onBrand} />
      </Pressable>

      <Modal
        visible={composerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Moment</Text>
              <Pressable
                testID="moment-composer-close-btn"
                onPress={() => setComposerOpen(false)}
              >
                <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            <TextInput
              testID="moment-composer-input"
              style={styles.composerInput}
              placeholder="Share something with the community... ask a language question, celebrate a win!"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
              value={draft}
              onChangeText={setDraft}
              maxLength={1000}
            />
            <Pressable
              testID="moment-publish-btn"
              style={[
                styles.publishBtn,
                (!draft.trim() || posting) && { opacity: 0.4 },
              ]}
              disabled={!draft.trim() || posting}
              onPress={publish}
            >
              {posting ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.publishText}>Post</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
    paddingBottom: spacing.sm,
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
  list: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  authorName: {
    fontFamily: fonts.displaySemi,
    fontSize: 15,
    color: colors.onSurface,
  },
  cardTime: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  cardText: {
    fontFamily: fonts.text,
    fontSize: 15,
    lineHeight: 22,
    color: colors.onSurface,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  actionText: {
    fontFamily: fonts.textSemi,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    minHeight: 300,
  },
  emptyText: {
    fontFamily: fonts.textSemi,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.onSurface,
  },
  composerInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 120,
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
  publishBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  publishText: {
    color: colors.onBrand,
    fontFamily: fonts.textBold,
    fontSize: 16,
  },
});
