import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { useChatSocket } from "@/src/hooks/use-chat-socket";
import { fonts } from "@/src/theme";
import { api, Conversation } from "@/src/utils/api";

export default function TabsLayout() {
  const { colors } = useTheme();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const convs = await api.get<Conversation[]>("/chats");
      setUnread(convs.reduce((sum, c) => sum + (c.unread || 0), 0));
    } catch {
      // keep previous count
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 12000);
    return () => clearInterval(t);
  }, [loadUnread]);

  useChatSocket(
    useCallback(
      (event) => {
        if (event.type === "new_message") loadUnread();
      },
      [loadUnread],
    ),
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceSecondary,
        tabBarLabelStyle: {
          fontFamily: fonts.textBold,
          fontSize: 11,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          ...(Platform.OS === "ios" ? {} : { height: 62, paddingBottom: 8 }),
        },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarButtonTestID: "tab-chats",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.error,
            color: "#FFFFFF",
            fontFamily: fonts.textBold,
            fontSize: 10,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="connect"
        options={{
          title: "Connect",
          tabBarButtonTestID: "tab-connect",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="moments"
        options={{
          title: "Moments",
          tabBarButtonTestID: "tab-moments",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="planet" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="voice"
        options={{
          title: "Voice",
          tabBarButtonTestID: "tab-voice",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mic" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Me",
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
