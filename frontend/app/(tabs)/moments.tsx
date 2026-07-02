import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import { VipBadge } from "@/src/components/Badges";
import { FlagIcon } from "@/src/components/FlagIcon";
import { LikersRow } from "@/src/components/LikersRow";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, assetUrl, Moment } from "@/src/utils/api";
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
  const [photo, setPhoto] = useState<{ base64: string; uri: string; mime: string } | null>(null);
  const [unread, setUnread] = useState(0);

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
      api
        .get<{ unread: number }>("/notifications")
        .then((d) => setUnread(d.unread))
        .catch(() => {});
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

  const pickPhoto = async () => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!current.granted) {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Photos",
            "Photo access is disabled. Enable it in Settings to share photos.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert("Photos", "Photo access is needed to add a photo.");
        }
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    setPhoto({
      base64: asset.base64,
      uri: asset.uri,
      mime: asset.mimeType || "image/jpeg",
    });
  };

  const publish = async () => {
    if (!draft.trim() && !photo) return;
    setPosting(true);
    try {
      await api.post("/moments", {
        text: draft.trim(),
        image_base64: photo?.base64,
        mime: photo?.mime,
      });
      setDraft("");
      setPhoto(null);
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
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Moments</Text>
          <Text style={styles.headerSub}>What the community is saying</Text>
        </View>
        <Pressable
          testID="notifications-bell-btn"
          style={styles.bellBtn}
          onPress={() => router.push("/notifications")}
        >
          <Ionicons name="notifications" size={22} color={colors.brand} />
          {unread > 0 && (
            <View style={styles.bellBadge} testID="notifications-badge">
              <Text style={styles.bellBadgeText}>
                {unread > 99 ? "99+" : unread}
              </Text>
            </View>
          )}
        </Pressable>
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
                <Pressable
                  testID={`moment-author-avatar-${item.id}`}
                  onPress={() =>
                    item.author?.id && router.push(`/user/${item.author.id}`)
                  }
                >
                  <Avatar
                    name={item.author?.name}
                    url={item.author?.avatar_url}
                    size={42}
                    flagCode={countryToCode(item.author?.country)}
                    online={item.author?.is_online}
                    frame={item.author?.active_frame}
                  />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.authorRow}>
                    <Text style={styles.authorName}>
                      {item.author?.name || "Unknown"}
                    </Text>
                    {item.author?.active_badge?.emoji ? (
                      <Text style={{ fontSize: 12 }}>
                        {item.author.active_badge.emoji}
                      </Text>
                    ) : null}
                    {item.author?.is_vip ? (
                      <VipBadge small tier={item.author?.vip_tier} />
                    ) : null}
                  </View>
                  <View style={styles.langRow}>
                    <FlagIcon code={item.author?.native_language} size={13} />
                    <Ionicons
                      name="arrow-forward"
                      size={9}
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
                        <FlagIcon key={c} code={c} size={13} />
                      ))}
                    <Text style={styles.cardTime}>
                      {" "}· {timeAgo(item.created_at)}
                    </Text>
                  </View>
                </View>
              </View>
              {item.text ? <Text style={styles.cardText}>{item.text}</Text> : null}
              {item.image_url ? (
                <Image
                  testID={`moment-image-${item.id}`}
                  source={{ uri: assetUrl(item.image_url)! }}
                  style={styles.cardImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : null}
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
              <LikersRow
                momentId={item.id}
                likeCount={item.like_count}
                likers={item.likers}
              />
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
            {photo && (
              <View style={styles.photoPreviewWrap}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photoPreview}
                  contentFit="cover"
                />
                <Pressable
                  testID="moment-photo-remove-btn"
                  style={styles.photoRemove}
                  onPress={() => setPhoto(null)}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </Pressable>
              </View>
            )}
            <View style={styles.composerActions}>
              <Pressable
                testID="moment-photo-btn"
                style={styles.photoBtn}
                onPress={pickPhoto}
              >
                <Ionicons name="image" size={20} color={colors.brand} />
                <Text style={styles.photoBtnText}>Photo</Text>
              </Pressable>
              <Pressable
                testID="moment-publish-btn"
                style={[
                  styles.publishBtn,
                  ((!draft.trim() && !photo) || posting) && { opacity: 0.4 },
                ]}
                disabled={(!draft.trim() && !photo) || posting}
                onPress={publish}
              >
                {posting ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <Text style={styles.publishText}>Post</Text>
                )}
              </Pressable>
            </View>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  bellBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: "#FFF",
    fontFamily: fonts.textBold,
    fontSize: 10,
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
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
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
  cardImage: {
    width: "100%",
    height: 220,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
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
  photoPreviewWrap: {
    alignSelf: "flex-start",
  },
  photoPreview: {
    width: 90,
    height: 90,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  photoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  photoBtnText: {
    fontFamily: fonts.textBold,
    fontSize: 13,
    color: colors.onBrandTertiary,
  },
  publishBtn: {
    flex: 1,
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
