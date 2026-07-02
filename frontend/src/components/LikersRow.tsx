import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Avatar } from "@/src/components/Avatar";
import { VipBadge } from "@/src/components/Badges";
import { countryToCode } from "@/src/constants/countries";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme";
import { api, User } from "@/src/utils/api";

interface LikersRowProps {
  momentId: string;
  likeCount: number;
  likers?: User[];
}

/** Collapsed row of liker avatars (with flags) under a moment.
 *  Tapping opens a bottom sheet listing everyone who liked. */
export const LikersRow: React.FC<LikersRowProps> = ({
  momentId,
  likeCount,
  likers,
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<User[] | null>(null);

  if (!likeCount || !likers?.length) return null;

  const openList = async () => {
    setOpen(true);
    try {
      setList(await api.get<User[]>(`/moments/${momentId}/likes`));
    } catch {
      setList([]);
    }
  };

  const close = () => {
    setOpen(false);
    setList(null);
  };

  return (
    <>
      <Pressable
        testID={`moment-likers-${momentId}`}
        style={styles.row}
        onPress={openList}
        hitSlop={4}
      >
        <Ionicons name="heart" size={13} color={colors.error} />
        <View style={styles.stack}>
          {likers.slice(0, 6).map((u, i) => (
            <View
              key={u.id}
              style={[
                styles.stackItem,
                { borderColor: colors.surface },
                i > 0 && { marginLeft: -9 },
              ]}
            >
              <Avatar
                name={u.name}
                url={u.avatar_url}
                size={24}
                flagCode={countryToCode(u.country)}
              />
            </View>
          ))}
        </View>
        <Text style={[styles.text, { color: colors.onSurfaceSecondary }]}>
          {likeCount} {likeCount === 1 ? "like" : "likes"}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={13}
          color={colors.onSurfaceSecondary}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.onSurface }]}>
                Liked by
              </Text>
              <Pressable testID="likers-close-btn" onPress={close} hitSlop={8}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.onSurfaceSecondary}
                />
              </Pressable>
            </View>
            {!list ? (
              <ActivityIndicator
                size="large"
                color={colors.brand}
                style={{ paddingVertical: spacing.xl }}
              />
            ) : (
              <FlatList
                data={list}
                keyExtractor={(u) => u.id}
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`liker-row-${item.id}`}
                    style={styles.liker}
                    onPress={() => {
                      close();
                      if (item.id) router.push(`/user/${item.id}`);
                    }}
                  >
                    <Avatar
                      name={item.name}
                      url={item.avatar_url}
                      size={40}
                      flagCode={countryToCode(item.country)}
                      online={item.is_online}
                      frame={item.active_frame}
                    />
                    <Text
                      style={[styles.likerName, { color: colors.onSurface }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {item.is_vip ? (
                      <VipBadge small tier={item.vip_tier} />
                    ) : null}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stack: {
    flexDirection: "row",
    alignItems: "center",
  },
  stackItem: {
    borderRadius: 14,
    borderWidth: 2,
  },
  text: {
    fontFamily: fonts.textSemi,
    fontSize: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
  },
  liker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  likerName: {
    fontFamily: fonts.textSemi,
    fontSize: 15,
    flexShrink: 1,
  },
});
