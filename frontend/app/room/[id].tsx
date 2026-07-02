import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { SpeakingBars } from "@/src/components/SpeakingBars";
import { countryToCode } from "@/src/constants/countries";
import { langName } from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useCall } from "@/src/context/CallContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useRoomAudio } from "@/src/hooks/use-room-audio";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";
import { api, Room, RoomMember, RoomMessage } from "@/src/utils/api";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { sendSignal, subscribe } = useCall();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const chatListRef = useRef<FlatList<RoomMessage>>(null);

  const members: RoomMember[] = room?.members || [];
  const me = members.find((m) => m.id === user?.id);
  const isHost = me?.role === "host";
  const isSpeaker = isHost || me?.role === "speaker";

  useRoomAudio({
    roomId: id!,
    myId: user?.id || "",
    members,
    sendSignal,
    subscribe,
  });

  const load = useCallback(async () => {
    try {
      const [r, msgs] = await Promise.all([
        api.get<Room>(`/rooms/${id}`),
        api.get<RoomMessage[]>(`/rooms/${id}/messages`),
      ]);
      setRoom(r);
      setMessages(msgs);
    } catch {
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = subscribe((event: any) => {
      if (event.type === "room_update" && event.room?.id === id) {
        setRoom(event.room);
      } else if (event.type === "room_message" && event.message?.room_id === id) {
        setMessages((prev) =>
          prev.some((m) => m.id === event.message.id)
            ? prev
            : [...prev, event.message],
        );
      } else if (event.type === "room_ended" && event.room_id === id) {
        Alert.alert("Room ended", "The host has ended this room.");
        router.back();
      }
    });
    return unsub;
  }, [id, subscribe, router]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const leave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.post(`/rooms/${id}/leave`);
    } finally {
      router.back();
    }
  };

  const toggleMic = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post(`/rooms/${id}/mic`);
    } catch {
      // room may have ended
    }
  };

  const toggleHand = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post(`/rooms/${id}/hand`);
    } catch {
      // ignore
    }
  };

  const changeRole = async (member: RoomMember, role: "speaker" | "listener") => {
    try {
      await api.post(`/rooms/${id}/role`, { user_id: member.id, role });
    } catch {
      // ignore
    }
  };

  const kickMember = async (member: RoomMember) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.post(`/rooms/${id}/kick`, { user_id: member.id });
    } catch {
      // ignore
    }
  };

  const dismissHand = async (member: RoomMember) => {
    try {
      await api.post(`/rooms/${id}/hand/dismiss`, { user_id: member.id });
    } catch {
      // ignore
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    try {
      const msg = await api.post<RoomMessage>(`/rooms/${id}/messages`, { text });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
    } catch {
      // ignore
    }
  };

  const host = members.find((m) => m.role === "host");
  const speakers = members.filter((m) => m.role === "speaker");
  const listeners = members.filter((m) => m.role === "listener");
  const handRequests = listeners.filter((m) => m.hand_raised);

  if (loading || !room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const renderMember = (member: RoomMember, size: number) => (
    <View key={member.id} style={styles.memberCell} testID={`room-member-${member.id}`}>
      <View>
        <Avatar
          name={member.name}
          url={member.avatar_url}
          size={size}
          flagCode={countryToCode(member.country)}
          frame={member.active_frame}
          isSpeaking={member.role !== "listener" && member.mic_on}
        />
        {(member.role === "host" || member.role === "speaker") && (
          <View
            style={[
              styles.micBadge,
              { backgroundColor: member.mic_on ? colors.success : colors.borderStrong },
            ]}
          >
            {member.mic_on ? (
              <SpeakingBars />
            ) : (
              <Ionicons name="mic-off" size={11} color="#FFF" />
            )}
          </View>
        )}
        {member.hand_raised && (
          <View style={styles.handBadge}>
            <Ionicons name="hand-left" size={11} color="#FFF" />
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          maxWidth: size + 28,
        }}
      >
        {member.active_badge?.emoji ? (
          <Text style={{ fontSize: 10 }}>{member.active_badge.emoji}</Text>
        ) : null}
        <Text style={styles.memberName} numberOfLines={1}>
          {member.id === user?.id ? "You" : member.name.split(" ")[0]}
        </Text>
        {member.is_vip ? <VipBadge small tier={member.vip_tier} /> : null}
      </View>
      {isHost && member.id !== user?.id && (
        <View style={styles.hostActions}>
          <Pressable
            testID={`room-role-btn-${member.id}`}
            style={styles.roleBtn}
            onPress={() =>
              changeRole(member, member.role === "listener" ? "speaker" : "listener")
            }
            hitSlop={4}
          >
            <Ionicons
              name={member.role === "listener" ? "arrow-up" : "arrow-down"}
              size={13}
              color={colors.onBrandTertiary}
            />
          </Pressable>
          <Pressable
            testID={`room-kick-btn-${member.id}`}
            style={styles.kickBtn}
            onPress={() => kickMember(member)}
            hitSlop={4}
          >
            <Ionicons name="close" size={13} color={colors.error} />
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="room-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <View style={styles.liveDot} />
            <Text style={styles.title} numberOfLines={1}>
              {room.title}
            </Text>
          </View>
          <View style={styles.subRow}>
            <FlagIcon code={room.language} size={13} />
            <Text style={styles.subText}>
              {langName(room.language)} · {members.length}{" "}
              {members.length === 1 ? "member" : "members"}
            </Text>
          </View>
        </View>
        <Pressable testID="room-leave-btn" style={styles.leaveBtn} onPress={leave}>
          <Text style={styles.leaveText}>{isHost ? "End" : "Leave"}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.stage}>
          {host && (
            <View style={styles.hostCard} testID="room-host-card">
              <View>
                <Avatar
                  name={host.name}
                  url={host.avatar_url}
                  size={64}
                  flagCode={countryToCode(host.country)}
                />
                <View
                  style={[
                    styles.micBadge,
                    {
                      backgroundColor: host.mic_on
                        ? colors.success
                        : colors.borderStrong,
                    },
                  ]}
                >
                  <Ionicons
                    name={host.mic_on ? "mic" : "mic-off"}
                    size={11}
                    color="#FFF"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.hostNameRow}>
                  <Ionicons name="ribbon" size={14} color={colors.warning} />
                  <Text style={styles.hostName} numberOfLines={1}>
                    {host.id === user?.id ? "You" : host.name}
                  </Text>
                </View>
                <Text style={styles.hostLabel}>Room Host</Text>
              </View>
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>HOST</Text>
              </View>
            </View>
          )}

          {isHost && handRequests.length > 0 && (
            <View style={styles.requestsCard} testID="hand-requests-panel">
              <Text style={styles.requestsTitle}>
                ✋ Stage requests · {handRequests.length}
              </Text>
              {handRequests.map((m) => (
                <View key={m.id} style={styles.requestRow}>
                  <Avatar
                    name={m.name}
                    url={m.avatar_url}
                    size={32}
                    flagCode={countryToCode(m.country)}
                  />
                  <Text style={styles.requestName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Pressable
                    testID={`hand-accept-${m.id}`}
                    style={styles.acceptBtn}
                    onPress={() => changeRole(m, "speaker")}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    testID={`hand-dismiss-${m.id}`}
                    style={styles.dismissBtn}
                    onPress={() => dismissHand(m)}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={16} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionLabel}>
            On stage · {speakers.length + (host ? 1 : 0)}
          </Text>
          <View style={styles.memberGrid}>
            {speakers.length === 0 ? (
              <Text style={styles.stageEmpty}>
                Stage is open — raise your hand to join!
              </Text>
            ) : (
              speakers.map((m) => renderMember(m, 56))
            )}
          </View>
          {listeners.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Audience · {listeners.length}</Text>
              <View style={styles.memberGrid}>
                {listeners.map((m) => renderMember(m, 44))}
              </View>
            </>
          )}
        </View>

        <View style={styles.chatSection}>
          <FlatList
            ref={chatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatList}
            ListEmptyComponent={
              <Text style={styles.chatEmpty}>
                Say hi in the room chat 👋
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.chatRow}>
                <Avatar
                  name={item.sender?.name}
                  url={item.sender?.avatar_url}
                  size={24}
                />
                <Text style={styles.chatText}>
                  <Text style={styles.chatSender}>{item.sender?.name}  </Text>
                  {item.text}
                </Text>
              </View>
            )}
          />
        </View>

        <View style={styles.controls}>
          {isSpeaker ? (
            <Pressable
              testID="room-mic-btn"
              style={[
                styles.controlBtn,
                me?.mic_on ? styles.micOn : styles.micOff,
              ]}
              onPress={toggleMic}
            >
              <Ionicons
                name={me?.mic_on ? "mic" : "mic-off"}
                size={22}
                color={me?.mic_on ? colors.onBrand : colors.onSurfaceTertiary}
              />
            </Pressable>
          ) : (
            <Pressable
              testID="room-hand-btn"
              style={[
                styles.controlBtn,
                me?.hand_raised ? styles.handActive : styles.micOff,
              ]}
              onPress={toggleHand}
            >
              <Ionicons
                name="hand-left"
                size={22}
                color={me?.hand_raised ? "#FFF" : colors.onSurfaceTertiary}
              />
            </Pressable>
          )}
          <TextInput
            testID="room-chat-input"
            style={styles.input}
            placeholder="Message the room..."
            placeholderTextColor={colors.onSurfaceSecondary}
            value={draft}
            onChangeText={setDraft}
          />
          <Pressable
            testID="room-chat-send-btn"
            style={[styles.sendBtn, !draft.trim() && { opacity: 0.4 }]}
            disabled={!draft.trim()}
            onPress={sendMessage}
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
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.error,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 17,
      color: colors.onSurface,
      flexShrink: 1,
    },
    subRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 2,
    },
    subText: {
      fontFamily: fonts.text,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
    },
    leaveBtn: {
      backgroundColor: "rgba(239, 68, 68, 0.12)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    leaveText: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.error,
    },
    stage: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    sectionLabel: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    memberGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.lg,
    },
    memberCell: {
      alignItems: "center",
      gap: 4,
      width: 76,
    },
    micBadge: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surfaceSecondary,
    },
    handBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.warning,
      alignItems: "center",
      justifyContent: "center",
    },
    memberName: {
      fontFamily: fonts.textSemi,
      fontSize: 12,
      color: colors.onSurface,
      maxWidth: 76,
    },
    hostCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.brandTertiary,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    hostNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    hostName: {
      fontFamily: fonts.displaySemi,
      fontSize: 16,
      color: colors.onBrandTertiary,
      flexShrink: 1,
    },
    hostLabel: {
      fontFamily: fonts.text,
      fontSize: 12,
      color: colors.onBrandTertiary,
      opacity: 0.8,
      marginTop: 1,
    },
    hostBadge: {
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 3,
    },
    hostBadgeText: {
      fontFamily: fonts.textBold,
      fontSize: 10,
      color: colors.onBrand,
      letterSpacing: 0.8,
    },
    requestsCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    requestsTitle: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: colors.onSurface,
    },
    requestRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    requestName: {
      flex: 1,
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: colors.onSurface,
    },
    acceptBtn: {
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    acceptText: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: colors.onBrand,
    },
    dismissBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    stageEmpty: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    hostActions: {
      flexDirection: "row",
      gap: 4,
    },
    roleBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    kickBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "rgba(239, 68, 68, 0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    chatSection: {
      flex: 1,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: "hidden",
    },
    chatList: {
      padding: spacing.lg,
      gap: spacing.sm,
      flexGrow: 1,
    },
    chatEmpty: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
    chatRow: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "flex-start",
    },
    chatSender: {
      fontFamily: fonts.textBold,
      color: colors.brand,
    },
    chatText: {
      flex: 1,
      fontFamily: fonts.text,
      fontSize: 14,
      lineHeight: 20,
      color: colors.onSurface,
    },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    controlBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    micOn: {
      backgroundColor: colors.success,
    },
    micOff: {
      backgroundColor: colors.surfaceSecondary,
    },
    handActive: {
      backgroundColor: colors.warning,
    },
    input: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      fontFamily: fonts.text,
      fontSize: 14,
      color: colors.onSurface,
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
