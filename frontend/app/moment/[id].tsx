import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { VipBadge } from "@/src/components/Badges";
import { LikersRow } from "@/src/components/LikersRow";
import { RoomMomentCard } from "@/src/components/RoomMomentCard";
import { countryToCode } from "@/src/constants/countries";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, assetUrl, Moment, MomentComment } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

export default function MomentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [translation, setTranslation] = useState<string | null>(null);
  const [showAuthorBar, setShowAuthorBar] = useState(false);
  const [translating, setTranslating] = useState(false);
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const translatePost = async () => {
    if (translation) {
      setTranslation(null);
      return;
    }
    if (!moment?.text || translating) return;
    setTranslating(true);
    try {
      const result = await api.post<{ translated: string }>("/ai/translate", {
        text: moment.text,
        target_language: user?.native_language || "en",
      });
      setTranslation(result.translated);
    } catch (e) {
      Alert.alert(
        "Translate",
        e instanceof Error ? e.message : "Translation failed. Try again.",
      );
    } finally {
      setTranslating(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await api.get<Moment>(`/moments/${id}`);
      setMoment(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async () => {
    if (!moment) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoment({
      ...moment,
      liked_by_me: !moment.liked_by_me,
      like_count: moment.like_count + (moment.liked_by_me ? -1 : 1),
    });
    try {
      await api.post(`/moments/${id}/like`);
    } catch {
      load();
    }
  };

  const joinRoom = async (roomId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post(`/rooms/${roomId}/join`);
      router.push(`/room/${roomId}`);
    } catch {
      Alert.alert("Room ended", "This voice room is no longer live.");
      load();
    }
  };

  const comment = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const newComment = await api.post<MomentComment>(
        `/moments/${id}/comments`,
        { text, reply_to: replyTo?.id },
      );
      setMoment((prev) =>
        prev
          ? {
              ...prev,
              comments: [...(prev.comments || []), newComment],
              comment_count: prev.comment_count + 1,
            }
          : prev,
      );
      setDraft("");
      setReplyTo(null);
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="moment-detail-screen">
      <View style={styles.header}>
        <Pressable
          testID="moment-detail-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        {showAuthorBar && moment?.author ? (
          <Pressable
            testID="moment-detail-header-author"
            style={styles.headerAuthor}
            onPress={() =>
              moment.author?.id && router.push(`/user/${moment.author.id}`)
            }
          >
            <Avatar
              name={moment.author.name}
              url={moment.author.avatar_url}
              size={30}
              frame={moment.author.active_frame}
            />
            <Text style={styles.headerAuthorName} numberOfLines={1}>
              {moment.author.name}
            </Text>
            {moment.author.is_vip ? (
              <VipBadge small tier={moment.author.vip_tier} />
            ) : null}
          </Pressable>
        ) : (
          <Text style={styles.headerTitle}>Moment</Text>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "web" ? undefined : "translate-with-padding"}
      >
        {loading || !moment ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={moment.comments || []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onScroll={(e) =>
              setShowAuthorBar(e.nativeEvent.contentOffset.y > 56)
            }
            scrollEventThrottle={16}
            ListHeaderComponent={
              <View style={styles.momentCard}>
                <View style={styles.authorRow}>
                <Pressable
                  testID="moment-detail-author-avatar"
                  onPress={() =>
                    moment.author?.id && router.push(`/user/${moment.author.id}`)
                  }
                >
                  <Avatar
                    name={moment.author?.name}
                    url={moment.author?.avatar_url}
                    size={44}
                    flagCode={countryToCode(moment.author?.country)}
                    online={moment.author?.is_online}
                    frame={moment.author?.active_frame}
                  />
                </Pressable>
                  <View>
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Text style={styles.authorName}>
                        {moment.author?.name}
                      </Text>
                      {moment.author?.is_vip ? (
                        <VipBadge small tier={moment.author?.vip_tier} />
                      ) : null}
                    </View>
                    <Text style={styles.time}>{timeAgo(moment.created_at)}</Text>
                  </View>
                </View>
                <Text style={styles.momentText}>{moment.text}</Text>
                {translation ? (
                  <View style={styles.translationBlock} testID="moment-detail-translation">
                    <Ionicons name="language" size={13} color={colors.brand} />
                    <Text style={styles.translationText}>{translation}</Text>
                  </View>
                ) : null}
                {moment.room ? (
                  <RoomMomentCard
                    testID="moment-detail-room-card"
                    room={moment.room}
                    onPress={() => joinRoom(moment.room!.id)}
                  />
                ) : moment.image_url ? (
                  <Image
                    testID="moment-detail-image"
                    source={{ uri: assetUrl(moment.image_url)! }}
                    style={styles.momentImage}
                    contentFit="cover"
                    transition={150}
                  />
                ) : null}
                <View style={styles.actionRow}>
                  <Pressable
                    testID="moment-detail-like-btn"
                    style={styles.actionBtn}
                    onPress={toggleLike}
                  >
                    <Ionicons
                      name={moment.liked_by_me ? "heart" : "heart-outline"}
                      size={22}
                      color={moment.liked_by_me ? colors.error : colors.onSurfaceSecondary}
                    />
                    <Text style={styles.actionText}>{moment.like_count}</Text>
                  </Pressable>
                  <View style={styles.actionBtn}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={20}
                      color={colors.onSurfaceSecondary}
                    />
                    <Text style={styles.actionText}>{moment.comment_count}</Text>
                  </View>
                  {moment.text ? (
                    <Pressable
                      testID="moment-detail-translate-btn"
                      style={styles.actionBtn}
                      onPress={translatePost}
                    >
                      {translating ? (
                        <ActivityIndicator size="small" color={colors.brand} />
                      ) : (
                        <Ionicons
                          name="language"
                          size={19}
                          color={translation ? colors.brand : colors.onSurfaceSecondary}
                        />
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <LikersRow
                  momentId={moment.id}
                  likeCount={moment.like_count}
                  likers={moment.likers}
                />
                <Text style={styles.commentsTitle}>Comments</Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.noComments}>
                No comments yet — be the first!
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[styles.commentRow, item.reply_to && styles.replyRow]}
              >
                <Pressable
                  testID={`comment-author-avatar-${item.id}`}
                  onPress={() =>
                    item.author?.id && router.push(`/user/${item.author.id}`)
                  }
                >
                  <Avatar
                    name={item.author?.name}
                    url={item.author?.avatar_url}
                    size={36}
                    flagCode={countryToCode(item.author?.country)}
                    online={item.author?.is_online}
                  />
                </Pressable>
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>
                    {item.author?.name}{" "}
                    <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                  </Text>
                  {item.reply_to_author ? (
                    <View style={styles.replyTag}>
                      <Ionicons
                        name="return-down-forward"
                        size={12}
                        color={colors.brand}
                      />
                      <Text style={styles.replyTagText}>
                        Replying to {item.reply_to_author}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.commentText}>{item.text}</Text>
                  <Pressable
                    testID={`comment-reply-btn-${item.id}`}
                    onPress={() =>
                      setReplyTo({
                        id: item.id,
                        name: item.author?.name || "comment",
                      })
                    }
                    hitSlop={6}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <Text style={styles.replyBtnText}>Reply</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}

        {replyTo && (
          <View style={styles.replyBanner} testID="reply-banner">
            <Ionicons name="return-down-forward" size={16} color={colors.brand} />
            <Text style={styles.replyBannerText} numberOfLines={1}>
              Replying to {replyTo.name}
            </Text>
            <Pressable
              testID="reply-cancel-btn"
              onPress={() => setReplyTo(null)}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            testID="comment-input"
            style={styles.input}
            placeholder={
              replyTo ? `Reply to ${replyTo.name}...` : "Write a comment..."
            }
            placeholderTextColor={colors.onSurfaceSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            testID="comment-send-btn"
            onPress={comment}
            style={[styles.sendBtn, (!draft.trim() || posting) && { opacity: 0.4 }]}
            disabled={!draft.trim() || posting}
          >
            <Ionicons name="send" size={18} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.onSurface,
  },
  headerAuthor: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerAuthorName: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: colors.onSurface,
    flexShrink: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  momentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  authorName: {
    fontFamily: fonts.displaySemi,
    fontSize: 15,
    color: colors.onSurface,
  },
  time: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  momentText: {
    fontFamily: fonts.text,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onSurface,
  },
  translationBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  translationText: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onBrandTertiary,
  },
  momentImage: {
    width: "100%",
    height: 240,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    marginTop: spacing.sm,
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
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
  commentsTitle: {
    fontFamily: fonts.textBold,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  noComments: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  commentRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  replyRow: {
    marginLeft: spacing.xl + spacing.sm,
  },
  replyTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  replyTagText: {
    fontFamily: fonts.textSemi,
    fontSize: 11,
    color: colors.brand,
  },
  replyBtnText: {
    fontFamily: fonts.textBold,
    fontSize: 12,
    color: colors.brand,
    marginTop: 2,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brandTertiary,
  },
  replyBannerText: {
    flex: 1,
    fontFamily: fonts.textSemi,
    fontSize: 13,
    color: colors.onBrandTertiary,
  },
  commentBody: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  commentAuthor: {
    fontFamily: fonts.textBold,
    fontSize: 13,
    color: colors.onSurface,
  },
  commentText: {
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurface,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.onSurface,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
