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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { FlagIcon } from "@/src/components/FlagIcon";
import { countryToCode } from "@/src/constants/countries";
import { LANGUAGES, langName } from "@/src/constants/languages";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, Room } from "@/src/utils/api";
import { timeAgo } from "@/src/utils/time";

export default function Voice() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<string>("en");

  const load = useCallback(async () => {
    try {
      const data = await api.get<Room[]>("/rooms");
      setRooms(data);
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 10000);
      return () => clearInterval(t);
    }, [load]),
  );

  const createRoom = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const room = await api.post<Room>("/rooms", {
        title: title.trim(),
        language,
      });
      setModalOpen(false);
      setTitle("");
      router.push(`/room/${room.id}`);
    } catch {
      // keep modal open for retry
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (room: Room) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post(`/rooms/${room.id}/join`);
      router.push(`/room/${room.id}`);
    } catch {
      load();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="voice-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Rooms</Text>
        <Text style={styles.headerSub}>
          Join live audio rooms and practice speaking
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            rooms.length === 0 ? { flex: 1 } : styles.list
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="mic-outline" size={56} color={colors.borderStrong} />
              <Text style={styles.emptyTitle}>No live rooms right now</Text>
              <Text style={styles.emptyText}>
                Start one and invite partners to practice speaking!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`room-card-${item.id}`}
              style={styles.card}
              onPress={() => joinRoom(item)}
            >
              <View style={styles.cardTop}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <View style={styles.langBadge}>
                  <FlagIcon code={item.language} size={14} />
                  <Text style={styles.langText}>{langName(item.language)}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={styles.cardBottom}>
                <View style={styles.hostRow}>
                  <Avatar
                    name={item.host?.name}
                    url={item.host?.avatar_url}
                    size={28}
                    flagCode={countryToCode(item.host?.country)}
                  />
                  <Text style={styles.hostName}>
                    {item.host?.name} · {timeAgo(item.created_at)}
                  </Text>
                </View>
                <View style={styles.memberCount}>
                  <Ionicons name="people" size={14} color={colors.onSurfaceSecondary} />
                  <Text style={styles.memberText}>{item.member_count}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable
        testID="room-create-fab"
        style={styles.fab}
        onPress={() => setModalOpen(true)}
      >
        <Ionicons name="add" size={26} color={colors.onBrand} />
        <Text style={styles.fabText}>Create Room</Text>
      </Pressable>

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Voice Room</Text>
              <Pressable
                testID="room-modal-close-btn"
                onPress={() => setModalOpen(false)}
              >
                <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            <TextInput
              testID="room-title-input"
              style={styles.input}
              placeholder="Room topic, e.g. 'English coffee chat ☕'"
              placeholderTextColor={colors.onSurfaceSecondary}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
            <Text style={styles.modalLabel}>Room language</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm }}
            >
              {LANGUAGES.slice(0, 12).map((lang) => {
                const active = language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    testID={`room-lang-${lang.code}`}
                    onPress={() => setLanguage(lang.code)}
                    style={[styles.langChip, active && styles.langChipActive]}
                  >
                    <FlagIcon code={lang.code} size={16} />
                    <Text
                      style={[styles.langChipText, active && styles.langChipTextActive]}
                    >
                      {lang.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              testID="room-create-submit-btn"
              style={[styles.createBtn, (!title.trim() || creating) && { opacity: 0.4 }]}
              disabled={!title.trim() || creating}
              onPress={createRoom}
            >
              {creating ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.createText}>Go Live</Text>
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
      paddingBottom: 110,
      gap: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.md,
      ...shadow.card,
    },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(239, 68, 68, 0.12)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.error,
    },
    liveText: {
      fontFamily: fonts.textBold,
      fontSize: 10,
      color: colors.error,
      letterSpacing: 0.8,
    },
    langBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.brandTertiary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    langText: {
      fontFamily: fonts.textBold,
      fontSize: 11,
      color: colors.onBrandTertiary,
    },
    cardTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 17,
      color: colors.onSurface,
      lineHeight: 23,
    },
    cardBottom: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    hostRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    hostName: {
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    memberCount: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    memberText: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.xl,
    },
    emptyTitle: {
      fontFamily: fonts.displaySemi,
      fontSize: 18,
      color: colors.onSurface,
      marginTop: spacing.md,
    },
    emptyText: {
      fontFamily: fonts.text,
      fontSize: 14,
      color: colors.onSurfaceSecondary,
      textAlign: "center",
    },
    fab: {
      position: "absolute",
      right: spacing.xl,
      bottom: spacing.xl,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      ...shadow.card,
    },
    fabText: {
      color: colors.onBrand,
      fontFamily: fonts.textBold,
      fontSize: 15,
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
    modalLabel: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      padding: spacing.lg,
      fontFamily: fonts.text,
      fontSize: 15,
      color: colors.onSurface,
    },
    langChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    langChipActive: {
      backgroundColor: colors.brandTertiary,
    },
    langChipText: {
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: colors.onSurfaceTertiary,
    },
    langChipTextActive: {
      color: colors.onBrandTertiary,
      fontFamily: fonts.textBold,
    },
    createBtn: {
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    createText: {
      color: colors.onBrand,
      fontFamily: fonts.textBold,
      fontSize: 16,
    },
  });
