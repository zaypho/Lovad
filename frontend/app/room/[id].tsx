import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { VipBadge } from "@/src/components/Badges";
import { FlagIcon } from "@/src/components/FlagIcon";
import { countryToCode } from "@/src/constants/countries";
import { useAuth } from "@/src/context/AuthContext";
import { useCall } from "@/src/context/CallContext";
import { useRoomAudio } from "@/src/hooks/use-room-audio";
import { fonts, radius, spacing } from "@/src/theme";
import { api, Room, RoomGift, RoomMember, RoomMessage } from "@/src/utils/api";

const QUICK_REPLIES = [
  "Hey, everyone! 👋",
  "What's the topic?",
  "Nice to meet you!",
  "I'm new here!",
];

const BG_GRADIENTS: [string, string][] = [
  ["#2A2154", "#4B3F87"],
  ["#1E293B", "#334155"],
  ["#3B0764", "#701A75"],
  ["#0F2027", "#2C5364"],
];

const STAGE_SEATS = 8;
const MAX_LISTENERS_SHOWN = 7;

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { sendSignal, subscribe } = useCall();
  const styles = makeStyles();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [bgIndex, setBgIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [handModalOpen, setHandModalOpen] = useState(false);
  const [quickRepliesVisible, setQuickRepliesVisible] = useState(true);
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [gifts, setGifts] = useState<RoomGift[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTargetId, setGiftTargetId] = useState<string | null>(null);
  const [sendingGiftId, setSendingGiftId] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const chatListRef = useRef<FlatList<RoomMessage>>(null);

  const members: RoomMember[] = room?.members || [];
  const me = members.find((m) => m.id === user?.id);
  const isHost = me?.role === "host";
  const isSpeaker = isHost || me?.role === "speaker";
  const host = room?.host || null;

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
      if (r.host && r.host.id !== user?.id) {
        try {
          const hostProfile = await api.get<{ is_following: boolean }>(
            `/users/${r.host.id}`,
          );
          setIsFollowingHost(!!hostProfile.is_following);
        } catch {
          // non-critical
        }
      }
    } catch {
      router.back();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    load();
    api
      .get<{ coins: number; gifts: RoomGift[] }>("/rooms/gift-catalog")
      .then((res) => setGifts(res.gifts))
      .catch(() => {});
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

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (room?.chat_muted && !isHost) {
      Alert.alert("Chat muted", "The host has muted text chat right now.");
      return;
    }
    setDraft("");
    try {
      const msg = await api.post<RoomMessage>(`/rooms/${id}/messages`, {
        text: trimmed,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
    } catch (e) {
      Alert.alert("Message", e instanceof Error ? e.message : "Could not send.");
    }
  };

  const sendMessage = () => sendText(draft);

  const toggleChatMute = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post(`/rooms/${id}/chat-mute`);
    } catch {
      // ignore
    }
  };

  const shareToMoments = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.post(`/rooms/${id}/share-to-moments`);
      setToolsOpen(false);
      Alert.alert(
        "Shared to Moments! 🎉",
        "Your room is now visible in your Moments feed so more people can join.",
      );
    } catch (e) {
      Alert.alert(
        "Share",
        e instanceof Error ? e.message : "Could not share this room right now.",
      );
    }
  };

  const toggleFollowHost = async () => {
    if (!host || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await api.post<{ following: boolean }>(
        `/users/${host.id}/follow`,
      );
      setIsFollowingHost(res.following);
    } catch {
      // ignore
    } finally {
      setFollowBusy(false);
    }
  };

  const shareInvite = async () => {
    try {
      await Share.share({
        message: `Join "${room?.title}" — a live voice room on LinguaConnect! 🎙️`,
      });
    } catch {
      // user cancelled
    }
  };

  const openGiftModal = (targetId?: string | null) => {
    setGiftTargetId(targetId || host?.id || null);
    setGiftOpen(true);
  };

  const sendGift = async (gift: RoomGift) => {
    if (!giftTargetId || sendingGiftId) return;
    if ((user?.coins || 0) < gift.price) {
      Alert.alert(
        "Not enough coins",
        "Visit the market to top up your coins.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to Market", onPress: () => router.push("/market") },
        ],
      );
      return;
    }
    setSendingGiftId(gift.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await api.post<{ coins: number; message: RoomMessage }>(
        `/rooms/${id}/gift`,
        { to_user_id: giftTargetId, gift_id: gift.id },
      );
      if (user) setUser({ ...user, coins: res.coins });
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message],
      );
      setGiftOpen(false);
    } catch (e) {
      Alert.alert("Gift", e instanceof Error ? e.message : "Could not send gift.");
    } finally {
      setSendingGiftId(null);
    }
  };

  const toggleTranslate = async (msg: RoomMessage) => {
    if (translations[msg.id] !== undefined) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
      return;
    }
    setTranslatingId(msg.id);
    try {
      const res = await api.post<{ translated: string }>("/ai/translate", {
        text: msg.text,
        target_language: user?.native_language || "en",
      });
      setTranslations((prev) => ({ ...prev, [msg.id]: res.translated }));
    } catch {
      // ignore
    } finally {
      setTranslatingId(null);
    }
  };

  const onAvatarPress = (member: RoomMember) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (member.id === user?.id) {
      if (isSpeaker) toggleMic();
      else toggleHand();
      return;
    }
    if (isHost && member.role !== "host") {
      Alert.alert(member.name, undefined, [
        {
          text: member.role === "listener" ? "Move to stage" : "Move to audience",
          onPress: () =>
            changeRole(member, member.role === "listener" ? "speaker" : "listener"),
        },
        { text: "Send a gift 🎁", onPress: () => openGiftModal(member.id) },
        {
          text: "Remove from room",
          style: "destructive",
          onPress: () => kickMember(member),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      Alert.alert(member.name, undefined, [
        { text: "Send a gift 🎁", onPress: () => openGiftModal(member.id) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const onEmptySeatPress = () => {
    if (isSpeaker) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleHand();
  };

  const hostMember = members.find((m) => m.role === "host");
  const speakers = members.filter((m) => m.role === "speaker");
  const listeners = members.filter((m) => m.role === "listener");
  const handRequests = listeners.filter((m) => m.hand_raised);
  const stageMembers = [hostMember, ...speakers].filter(
    (m): m is RoomMember => !!m,
  );
  const emptySeatCount = Math.max(0, STAGE_SEATS - stageMembers.length);
  const shownListeners = listeners.slice(0, MAX_LISTENERS_SHOWN);
  const extraListeners = listeners.length - shownListeners.length;
  const giftTarget = members.find((m) => m.id === giftTargetId);

  if (loading || !room) {
    return (
      <LinearGradient colors={BG_GRADIENTS[bgIndex]} style={styles.container}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const renderStageMember = (member: RoomMember) => (
    <Pressable
      key={member.id}
      style={styles.memberCell}
      testID={`room-member-${member.id}`}
      onPress={() => onAvatarPress(member)}
    >
      <View>
        <Avatar
          name={member.name}
          url={member.avatar_url}
          size={56}
          flagCode={countryToCode(member.country)}
          online
          frame={member.active_frame}
          isSpeaking={member.mic_on}
        />
        <View
          style={[
            styles.micBadge,
            { backgroundColor: member.mic_on ? "#22C55E" : "rgba(255,255,255,0.25)" },
          ]}
        >
          <Ionicons
            name={member.mic_on ? "mic" : "mic-off"}
            size={11}
            color="#FFF"
          />
        </View>
        {member.hand_raised && (
          <View style={styles.handBadge}>
            <Ionicons name="hand-left" size={11} color="#FFF" />
          </View>
        )}
        {member.role === "host" && (
          <View style={styles.hostCrown}>
            <Ionicons name="ribbon" size={12} color="#FBBF24" />
          </View>
        )}
      </View>
      <View style={styles.memberNameRow}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.id === user?.id ? "You" : member.name.split(" ")[0]}
        </Text>
        {member.is_vip ? <VipBadge small tier={member.vip_tier} /> : null}
      </View>
    </Pressable>
  );

  const renderListenerMember = (member: RoomMember) => (
    <Pressable
      key={member.id}
      style={styles.listenerCell}
      testID={`room-listener-${member.id}`}
      onPress={() => onAvatarPress(member)}
    >
      <Avatar
        name={member.name}
        url={member.avatar_url}
        size={44}
        flagCode={countryToCode(member.country)}
        online
      />
      {member.hand_raised && (
        <View style={styles.handBadgeSmall}>
          <Ionicons name="hand-left" size={9} color="#FFF" />
        </View>
      )}
      <Text style={styles.listenerName} numberOfLines={1}>
        {member.id === user?.id ? "You" : member.name.split(" ")[0]}
      </Text>
    </Pressable>
  );

  const renderEmptySeat = (i: number) => (
    <Pressable
      key={`empty-${i}`}
      style={styles.emptySeat}
      testID={`room-empty-seat-${i}`}
      onPress={onEmptySeatPress}
    >
      <View style={styles.emptySeatCircle}>
        <Ionicons name="add" size={20} color="rgba(255,255,255,0.6)" />
      </View>
    </Pressable>
  );

  return (
    <LinearGradient colors={BG_GRADIENTS[bgIndex]} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="room-screen">
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <View style={styles.liveDot} />
              <Text style={styles.title} numberOfLines={1}>
                {room.title}
              </Text>
              {host && host.id !== user?.id && (
                <Pressable
                  testID="room-follow-btn"
                  style={[styles.followBtn, isFollowingHost && styles.followingBtn]}
                  onPress={toggleFollowHost}
                  disabled={followBusy}
                >
                  <Text style={styles.followText}>
                    {isFollowingHost ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={styles.subRow}>
              <FlagIcon code={room.language} size={12} />
              <View style={styles.levelChip}>
                <Text style={styles.levelText}>Lv.{room.host_level || 1}</Text>
              </View>
              <Text style={styles.subText}>
                {members.length} {members.length === 1 ? "member" : "members"}
              </Text>
            </View>
          </View>
          <Pressable
            testID="room-menu-btn"
            style={styles.menuBtn}
            onPress={() => setMenuOpen(true)}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {isHost && handRequests.length > 0 && (
          <Pressable
            testID="room-hand-requests-btn"
            style={styles.handNotifyBar}
            onPress={() => setHandModalOpen(true)}
          >
            <View style={styles.handNotifyIconWrap}>
              <Ionicons name="hand-left" size={15} color="#FFFFFF" />
              <View style={styles.handNotifyBadge}>
                <Text style={styles.handNotifyBadgeText}>{handRequests.length}</Text>
              </View>
            </View>
            <Text style={styles.handNotifyText}>
              {handRequests.length === 1
                ? `${handRequests[0].name} wants to join the stage`
                : `${handRequests.length} people want to join the stage`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        )}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "web" ? undefined : "translate-with-padding"}
        >
          <ScrollView
            style={styles.stageScroll}
            contentContainerStyle={styles.stage}
            showsVerticalScrollIndicator={false}
          >

            <View style={styles.stageGrid}>
              {stageMembers.map(renderStageMember)}
              {Array.from({ length: emptySeatCount }).map((_, i) =>
                renderEmptySeat(i),
              )}
            </View>

            {listeners.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  Audience · {listeners.length}
                </Text>
                <View style={styles.listenerRow}>
                  {shownListeners.map(renderListenerMember)}
                  {extraListeners > 0 && (
                    <Pressable
                      style={styles.listenerCell}
                      testID="room-listeners-more"
                      onPress={() =>
                        Alert.alert(
                          "Audience",
                          listeners
                            .slice(MAX_LISTENERS_SHOWN)
                            .map((m) => m.name)
                            .join(", "),
                        )
                      }
                    >
                      <View style={styles.moreCircle}>
                        <Text style={styles.moreText}>+{extraListeners}</Text>
                      </View>
                      <Text style={styles.listenerName}>Others</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.chatSection}>
            <FlatList
              ref={chatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatList}
              ListHeaderComponent={
                <View style={styles.noticeBubble} testID="room-notice">
                  <View style={styles.noticeIconWrap}>
                    <Ionicons name="megaphone" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={styles.noticeText}>
                    Please speak the room&apos;s language and keep it friendly —
                    enjoy practicing together! 🎉
                  </Text>
                </View>
              }
              ListEmptyComponent={
                <Text style={styles.chatEmpty}>Say hi in the room chat 👋</Text>
              }
              renderItem={({ item }) => {
                if (item.type === "system") {
                  return (
                    <View style={styles.systemRow} testID={`room-msg-${item.id}`}>
                      <Text style={styles.systemText}>{item.text}</Text>
                    </View>
                  );
                }
                if (item.type === "gift") {
                  return (
                    <View style={styles.giftRow} testID={`room-msg-${item.id}`}>
                      <Avatar
                        name={item.sender?.name}
                        url={item.sender?.avatar_url}
                        size={22}
                      />
                      <Text style={styles.giftText}>
                        <Text style={styles.giftSender}>{item.sender?.name} </Text>
                        {item.text}
                      </Text>
                    </View>
                  );
                }
                return (
                  <View style={styles.chatRow} testID={`room-msg-${item.id}`}>
                    <Avatar
                      name={item.sender?.name}
                      url={item.sender?.avatar_url}
                      size={24}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chatText}>
                        <Text style={styles.chatSender}>{item.sender?.name}  </Text>
                        {item.text}
                      </Text>
                      {translations[item.id] ? (
                        <Text style={styles.translatedText}>
                          🌐 {translations[item.id]}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      testID={`room-translate-${item.id}`}
                      onPress={() => toggleTranslate(item)}
                      hitSlop={6}
                      style={styles.translateBtn}
                    >
                      {translatingId === item.id ? (
                        <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                      ) : (
                        <Ionicons
                          name="language"
                          size={15}
                          color="rgba(255,255,255,0.55)"
                        />
                      )}
                    </Pressable>
                  </View>
                );
              }}
            />

            <View style={styles.floatingStack} pointerEvents="box-none">
              {(room.most_gifted || []).slice(0, 2).map((g) => (
                <View
                  key={g.id}
                  style={styles.topGifterWrap}
                  testID={`room-top-gifter-${g.id}`}
                >
                  <Avatar name={g.name} url={g.avatar_url} size={34} frame={g.active_frame} />
                  <View style={styles.crownBadge}>
                    <Ionicons name="trophy" size={9} color="#FBBF24" />
                  </View>
                </View>
              ))}
              <Pressable
                testID={isSpeaker ? "room-mic-btn" : "room-hand-btn"}
                style={[
                  styles.floatBtn,
                  isSpeaker
                    ? me?.mic_on
                      ? styles.micOn
                      : styles.micOff
                    : me?.hand_raised
                      ? styles.handActive
                      : styles.micOff,
                ]}
                onPress={isSpeaker ? toggleMic : toggleHand}
              >
                <Ionicons
                  name={isSpeaker ? (me?.mic_on ? "mic" : "mic-off") : "hand-left"}
                  size={22}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
          </View>

          {quickRepliesVisible && (
            <View style={styles.quickRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickScroll}
              >
                {QUICK_REPLIES.map((q) => (
                  <Pressable
                    key={q}
                    style={styles.quickChip}
                    onPress={() => sendText(q)}
                    testID={`room-quick-${q}`}
                  >
                    <Text style={styles.quickText}>{q}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                testID="room-quick-close"
                onPress={() => setQuickRepliesVisible(false)}
                hitSlop={8}
                style={styles.quickClose}
              >
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
          )}

          <View style={styles.controls}>
            <TextInput
              testID="room-chat-input"
              style={styles.input}
              placeholder={
                room.chat_muted && !isHost
                  ? "Chat muted by host"
                  : "Message the room..."
              }
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={draft}
              onChangeText={setDraft}
              editable={!(room.chat_muted && !isHost)}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <Pressable
              testID="room-mute-toggle-btn"
              style={styles.iconBtn}
              onPress={() => {
                if (isHost) toggleChatMute();
                else
                  Alert.alert(
                    "Room chat",
                    room.chat_muted
                      ? "Chat is muted by the host."
                      : "Chat is open.",
                  );
              }}
            >
              <Ionicons
                name={room.chat_muted ? "chatbox-outline" : "chatbox-ellipses-outline"}
                size={19}
                color={room.chat_muted ? "#F87171" : "rgba(255,255,255,0.75)"}
              />
            </Pressable>
            <Pressable
              testID="room-tools-btn"
              style={styles.iconBtn}
              onPress={() => setToolsOpen(true)}
            >
              <Ionicons name="grid-outline" size={19} color="rgba(255,255,255,0.75)" />
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            </Pressable>
            <Pressable
              testID="room-shop-btn"
              style={styles.iconBtn}
              onPress={() => router.push("/market")}
            >
              <Ionicons name="storefront-outline" size={19} color="rgba(255,255,255,0.75)" />
            </Pressable>
            <Pressable
              testID="room-gift-btn"
              style={styles.iconBtn}
              onPress={() => openGiftModal()}
            >
              <Ionicons name="gift-outline" size={19} color="rgba(255,255,255,0.75)" />
            </Pressable>
            {draft.trim().length > 0 && (
              <Pressable
                testID="room-chat-send-btn"
                style={styles.sendBtn}
                onPress={sendMessage}
              >
                <Ionicons name="send" size={16} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuSheet}>
              {isHost && (
                <Pressable
                  style={styles.menuRow}
                  testID="room-menu-mute-btn"
                  onPress={() => {
                    toggleChatMute();
                    setMenuOpen(false);
                  }}
                >
                  <Ionicons
                    name={room.chat_muted ? "chatbox-ellipses-outline" : "chatbox-outline"}
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text style={styles.menuText}>
                    {room.chat_muted ? "Unmute room chat" : "Mute room chat"}
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  shareInvite();
                }}
              >
                <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
                <Text style={styles.menuText}>Invite friends</Text>
              </Pressable>
              <Pressable
                style={[styles.menuRow, styles.menuRowDanger]}
                testID="room-leave-btn"
                onPress={() => {
                  setMenuOpen(false);
                  leave();
                }}
              >
                <Ionicons name="exit-outline" size={18} color="#F87171" />
                <Text style={[styles.menuText, { color: "#F87171" }]}>
                  {isHost ? "End room" : "Leave room"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={toolsOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setToolsOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setToolsOpen(false)}>
            <View style={styles.menuSheet}>
              <Text style={styles.menuTitle}>Room Tools</Text>
              <Pressable
                style={styles.menuRow}
                testID="room-bg-btn"
                onPress={() => setBgIndex((i) => (i + 1) % BG_GRADIENTS.length)}
              >
                <Ionicons name="color-palette-outline" size={18} color="#FFFFFF" />
                <Text style={styles.menuText}>Change background</Text>
              </Pressable>
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setToolsOpen(false);
                  shareInvite();
                }}
              >
                <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
                <Text style={styles.menuText}>Invite friends</Text>
              </Pressable>
              {isHost && (
                <Pressable
                  style={styles.menuRow}
                  testID="room-tools-mute-btn"
                  onPress={toggleChatMute}
                >
                  <Ionicons
                    name={room.chat_muted ? "chatbox-ellipses-outline" : "chatbox-outline"}
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text style={styles.menuText}>
                    {room.chat_muted ? "Unmute room chat" : "Mute room chat"}
                  </Text>
                </Pressable>
              )}
              {isHost && !room.is_private && (
                <Pressable
                  style={styles.menuRow}
                  testID="room-share-moments-btn"
                  onPress={shareToMoments}
                >
                  <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.menuText}>Share to Moments</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={handModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setHandModalOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setHandModalOpen(false)}
          >
            <Pressable style={styles.menuSheet} onPress={() => {}}>
              <Text style={styles.menuTitle}>
                ✋ Stage requests · {handRequests.length}
              </Text>
              {handRequests.length === 0 ? (
                <Text style={styles.menuText}>No pending requests.</Text>
              ) : (
                handRequests.map((m) => (
                  <View key={m.id} style={styles.requestRow}>
                    <Avatar
                      name={m.name}
                      url={m.avatar_url}
                      size={36}
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
                      <Text style={styles.acceptText}>Invite</Text>
                    </Pressable>
                    <Pressable
                      testID={`hand-dismiss-${m.id}`}
                      style={styles.dismissBtn}
                      onPress={() => dismissHand(m)}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={16} color="#F87171" />
                    </Pressable>
                  </View>
                ))
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={giftOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setGiftOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setGiftOpen(false)}>
            <Pressable style={styles.giftSheet} onPress={() => {}}>
              <View style={styles.giftHeader}>
                <Text style={styles.menuTitle}>
                  Send a gift
                  {giftTarget
                    ? ` to ${giftTarget.id === user?.id ? "yourself" : giftTarget.name}`
                    : ""}
                </Text>
                <View style={styles.coinsPill}>
                  <Ionicons name="logo-bitcoin" size={14} color="#FBBF24" />
                  <Text style={styles.coinsText}>{user?.coins || 0}</Text>
                </View>
              </View>
              <View style={styles.giftGrid}>
                {gifts.map((g) => (
                  <Pressable
                    key={g.id}
                    style={styles.giftItem}
                    testID={`room-gift-${g.id}`}
                    onPress={() => sendGift(g)}
                    disabled={!!sendingGiftId}
                  >
                    {sendingGiftId === g.id ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.giftItemEmoji}>{g.emoji}</Text>
                        <Text style={styles.giftItemName}>{g.name}</Text>
                        <View style={styles.giftPricePill}>
                          <Ionicons name="logo-bitcoin" size={11} color="#FBBF24" />
                          <Text style={styles.giftPriceText}>{g.price}</Text>
                        </View>
                      </>
                    )}
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    safe: {
      flex: 1,
      backgroundColor: "transparent",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexWrap: "wrap",
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: "#F87171",
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 17,
      color: "#FFFFFF",
      flexShrink: 1,
      maxWidth: 160,
    },
    followBtn: {
      backgroundColor: "rgba(255,255,255,0.18)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
    },
    followingBtn: {
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    followText: {
      fontFamily: fonts.textBold,
      fontSize: 11,
      color: "#FFFFFF",
    },
    subRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    levelChip: {
      backgroundColor: "rgba(255,255,255,0.16)",
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    levelText: {
      fontFamily: fonts.textBold,
      fontSize: 10,
      color: "#FDE68A",
    },
    subText: {
      fontFamily: fonts.text,
      fontSize: 11.5,
      color: "rgba(255,255,255,0.65)",
    },
    menuBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    stageScroll: {
      maxHeight: "42%",
    },
    stage: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.md,
    },
    sectionLabel: {
      fontFamily: fonts.textBold,
      fontSize: 11,
      color: "rgba(255,255,255,0.55)",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    handNotifyBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: "rgba(251,191,36,0.22)",
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.5)",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    handNotifyIconWrap: {
      position: "relative",
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    handNotifyBadge: {
      position: "absolute",
      top: -6,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "#EF4444",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    handNotifyBadgeText: {
      fontFamily: fonts.textBold,
      fontSize: 9,
      color: "#FFFFFF",
    },
    handNotifyText: {
      flex: 1,
      fontFamily: fonts.textSemi,
      fontSize: 12.5,
      color: "#FFFFFF",
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
      color: "#FFFFFF",
    },
    acceptBtn: {
      backgroundColor: "#8B7CF6",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    acceptText: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: "#FFFFFF",
    },
    dismissBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    stageGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      justifyContent: "flex-start",
    },
    memberCell: {
      alignItems: "center",
      gap: 4,
      width: 68,
    },
    micBadge: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#2A2154",
    },
    handBadge: {
      position: "absolute",
      top: -3,
      right: -3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#FBBF24",
      alignItems: "center",
      justifyContent: "center",
    },
    handBadgeSmall: {
      position: "absolute",
      top: -2,
      right: 4,
      width: 15,
      height: 15,
      borderRadius: 8,
      backgroundColor: "#FBBF24",
      alignItems: "center",
      justifyContent: "center",
    },
    hostCrown: {
      position: "absolute",
      top: -3,
      left: -3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
    memberNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      maxWidth: 72,
    },
    memberName: {
      fontFamily: fonts.textSemi,
      fontSize: 11,
      color: "#FFFFFF",
      maxWidth: 66,
    },
    emptySeat: {
      alignItems: "center",
      width: 68,
    },
    emptySeatCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.25)",
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
    },
    listenerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    listenerCell: {
      alignItems: "center",
      gap: 3,
      width: 54,
    },
    listenerName: {
      fontFamily: fonts.text,
      fontSize: 10.5,
      color: "rgba(255,255,255,0.75)",
      maxWidth: 54,
    },
    moreCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    moreText: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: "#FFFFFF",
    },
    chatSection: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.18)",
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: "hidden",
      position: "relative",
    },
    chatList: {
      padding: spacing.lg,
      gap: spacing.sm,
      flexGrow: 1,
      paddingRight: 56,
    },
    noticeBubble: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      marginBottom: spacing.sm,
    },
    noticeIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(255,255,255,0.16)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    noticeText: {
      flex: 1,
      fontFamily: fonts.text,
      fontSize: 12,
      lineHeight: 17,
      color: "rgba(255,255,255,0.8)",
    },
    chatEmpty: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: "rgba(255,255,255,0.55)",
      textAlign: "center",
      paddingTop: spacing.xl,
    },
    systemRow: {
      alignItems: "center",
      paddingVertical: 4,
    },
    systemText: {
      fontFamily: fonts.text,
      fontSize: 11.5,
      fontStyle: "italic",
      color: "rgba(255,255,255,0.55)",
      textAlign: "center",
    },
    giftRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: "rgba(251,191,36,0.14)",
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    giftText: {
      flex: 1,
      fontFamily: fonts.text,
      fontSize: 13,
      color: "#FDE68A",
    },
    giftSender: {
      fontFamily: fonts.textBold,
      color: "#FFFFFF",
    },
    chatRow: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "flex-start",
    },
    chatSender: {
      fontFamily: fonts.textBold,
      color: "#C4B5FD",
    },
    chatText: {
      fontFamily: fonts.text,
      fontSize: 13.5,
      lineHeight: 19,
      color: "#FFFFFF",
    },
    translatedText: {
      fontFamily: fonts.text,
      fontSize: 12,
      lineHeight: 17,
      color: "rgba(255,255,255,0.6)",
      marginTop: 2,
    },
    translateBtn: {
      padding: 4,
    },
    floatingStack: {
      position: "absolute",
      right: 10,
      bottom: 10,
      alignItems: "center",
      gap: 10,
    },
    topGifterWrap: {
      position: "relative",
    },
    crownBadge: {
      position: "absolute",
      top: -3,
      right: -3,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
    floatBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    micOn: {
      backgroundColor: "#22C55E",
    },
    micOff: {
      backgroundColor: "#6D5AE8",
    },
    handActive: {
      backgroundColor: "#FBBF24",
    },
    quickRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingBottom: 6,
      gap: spacing.xs,
    },
    quickScroll: {
      gap: spacing.xs,
      paddingRight: spacing.xs,
    },
    quickChip: {
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 6,
    },
    quickText: {
      fontFamily: fonts.textSemi,
      fontSize: 12,
      color: "#FFFFFF",
    },
    quickClose: {
      padding: 4,
    },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    input: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontFamily: fonts.text,
      fontSize: 13.5,
      color: "#FFFFFF",
    },
    iconBtn: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    newBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      backgroundColor: "#EF4444",
      borderRadius: 5,
      paddingHorizontal: 3,
      paddingVertical: 0.5,
    },
    newBadgeText: {
      fontFamily: fonts.textBold,
      fontSize: 6,
      color: "#FFFFFF",
    },
    sendBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#6D5AE8",
      alignItems: "center",
      justifyContent: "center",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuSheet: {
      backgroundColor: "#2A2154",
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: 4,
      paddingBottom: spacing.xl,
    },
    menuTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 15,
      color: "#FFFFFF",
      marginBottom: spacing.sm,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
      paddingVertical: spacing.sm + 2,
    },
    menuRowDanger: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(255,255,255,0.15)",
      marginTop: 4,
    },
    menuText: {
      fontFamily: fonts.textSemi,
      fontSize: 14,
      color: "#FFFFFF",
    },
    giftSheet: {
      backgroundColor: "#2A2154",
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    giftHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    coinsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
    },
    coinsText: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: "#FDE68A",
    },
    giftGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    giftItem: {
      width: "22.5%",
      aspectRatio: 0.85,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    giftItemEmoji: {
      fontSize: 26,
    },
    giftItemName: {
      fontFamily: fonts.textSemi,
      fontSize: 10.5,
      color: "#FFFFFF",
    },
    giftPricePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      backgroundColor: "rgba(0,0,0,0.3)",
      borderRadius: radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    giftPriceText: {
      fontFamily: fonts.textBold,
      fontSize: 10,
      color: "#FDE68A",
    },
  });
