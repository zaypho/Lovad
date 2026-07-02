import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Avatar } from "@/src/components/Avatar";
import { VipBadge } from "@/src/components/Badges";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";
import { User, wsUrl } from "@/src/utils/api";

/** Expanding ripple ring behind the avatar while ringing. */
const PulseRing: React.FC<{ size: number; delay: number }> = ({
  size,
  delay,
}) => {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      ),
    );
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.6 }],
    opacity: 0.55 * (1 - t.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: "#7DD3FC",
        },
        style,
      ]}
    />
  );
};

type SignalHandler = (event: any) => void;

interface CallState {
  status: "outgoing" | "incoming" | "active";
  peer: User;
  offerSdp?: any;
}

interface CallContextValue {
  startCall: (peer: User) => void;
  sendSignal: (data: Record<string, unknown>) => void;
  subscribe: (fn: SignalHandler) => () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Native WebRTC (react-native-webrtc) — available in production/dev builds,
// gracefully absent in Expo Go.
let NativeWebRTC: any = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NativeWebRTC = require("react-native-webrtc");
  } catch {
    NativeWebRTC = null;
  }
}

const getRTC = (): { PC: any; mediaDevices: any; native: boolean } | null => {
  if (Platform.OS === "web") {
    if (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof (window as any).RTCPeerConnection === "function"
    ) {
      return {
        PC: (window as any).RTCPeerConnection,
        mediaDevices: navigator.mediaDevices,
        native: false,
      };
    }
    return null;
  }
  if (NativeWebRTC?.RTCPeerConnection && NativeWebRTC?.mediaDevices) {
    return {
      PC: NativeWebRTC.RTCPeerConnection,
      mediaDevices: NativeWebRTC.mediaDevices,
      native: true,
    };
  }
  return null;
};

const webrtcAvailable = () => !!getRTC();

const RING_TIMEOUT_MS = 45000;

/** RN-web's Alert.alert is a no-op — use window.alert on web so users always see feedback. */
const notify = (title: string, message: string) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Set<SignalHandler>>(new Set());
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteAudioRef = useRef<any>(null);
  const callRef = useRef<CallState | null>(null);
  const pendingIceRef = useRef<any[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [call, setCallState] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const setCall = (c: CallState | null) => {
    callRef.current = c;
    setCallState(c);
  };

  const sendSignal = useCallback((data: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((fn: SignalHandler) => {
    subscribersRef.current.add(fn);
    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);

  const cleanupMedia = () => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    pendingIceRef.current = [];
    pcRef.current?.close?.();
    pcRef.current = null;
    localStreamRef.current?.getTracks?.().forEach((t: any) => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
    setMuted(false);
    setSeconds(0);
  };

  /** Apply buffered ICE candidates once the remote description is set. */
  const flushIce = async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingIceRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // stale candidate; ignore
      }
    }
  };

  const createPeer = async (peerId: string) => {
    const rtc = getRTC();
    if (!rtc) throw new Error("webrtc-unavailable");
    const stream = await rtc.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    const pc = new rtc.PC(RTC_CONFIG);
    stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
    pc.onicecandidate = (e: any) => {
      if (e.candidate) {
        sendSignal({ type: "call_ice", to: peerId, candidate: e.candidate });
      }
    };
    pc.ontrack = (e: any) => {
      if (rtc.native) {
        // react-native-webrtc plays remote audio tracks automatically.
        remoteAudioRef.current = e.streams?.[0] || null;
      } else {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.srcObject = e.streams[0];
        remoteAudioRef.current = audio;
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = useCallback(
    async (peer: User) => {
      if (callRef.current) return;
      if (!webrtcAvailable()) {
        notify(
          "Audio calls",
          Platform.OS === "web"
            ? "Your browser doesn't support audio calls."
            : "Audio calls work in the installed app (production build) or on the web. Voice messages work everywhere!",
        );
        return;
      }
      try {
        setCall({ status: "outgoing", peer });
        const pc = await createPeer(peer.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: "call_offer", to: peer.id, sdp: offer });
        ringTimeoutRef.current = setTimeout(() => {
          if (callRef.current?.status === "outgoing") {
            sendSignal({ type: "call_end", to: peer.id });
            cleanupMedia();
            setCall(null);
            notify("No answer", `${peer.name} didn't pick up. Try again later!`);
          }
        }, RING_TIMEOUT_MS);
      } catch {
        cleanupMedia();
        setCall(null);
        notify(
          "Call failed",
          "Could not access the microphone. Please allow microphone access and try again.",
        );
      }
    },
    [sendSignal],
  );

  const acceptCall = async () => {
    const current = callRef.current;
    if (!current?.offerSdp) return;
    if (!webrtcAvailable()) {
      sendSignal({ type: "call_decline", to: current.peer.id });
      setCall(null);
      notify(
        "Audio calls",
        "Audio calls work in the installed app (production build) or on the web.",
      );
      return;
    }
    try {
      const pc = await createPeer(current.peer.id);
      await pc.setRemoteDescription(current.offerSdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await flushIce();
      sendSignal({ type: "call_answer", to: current.peer.id, sdp: answer });
      setCall({ ...current, status: "active" });
    } catch {
      sendSignal({ type: "call_decline", to: current.peer.id });
      cleanupMedia();
      setCall(null);
    }
  };

  const declineCall = () => {
    const current = callRef.current;
    if (current) sendSignal({ type: "call_decline", to: current.peer.id });
    cleanupMedia();
    setCall(null);
  };

  const endCall = () => {
    const current = callRef.current;
    if (current) sendSignal({ type: "call_end", to: current.peer.id });
    cleanupMedia();
    setCall(null);
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t: any) => {
      t.enabled = !next;
    });
    setMuted(next);
  };

  const handleEvent = useCallback(async (event: any) => {
    subscribersRef.current.forEach((fn) => fn(event));
    const current = callRef.current;
    switch (event.type) {
      case "call_offer":
        if (current) {
          sendSignal({ type: "call_decline", to: event.from });
          return;
        }
        setCall({
          status: "incoming",
          peer: event.caller || { id: event.from, name: "Unknown" },
          offerSdp: event.sdp,
        });
        break;
      case "call_answer":
        if (current?.status === "outgoing" && pcRef.current) {
          try {
            if (ringTimeoutRef.current) {
              clearTimeout(ringTimeoutRef.current);
              ringTimeoutRef.current = null;
            }
            await pcRef.current.setRemoteDescription(event.sdp);
            await flushIce();
            setCall({ ...current, status: "active" });
          } catch {
            endCall();
          }
        }
        break;
      case "call_ice":
        if (event.candidate) {
          pendingIceRef.current.push(event.candidate);
          await flushIce();
        }
        break;
      case "call_unavailable":
        if (current?.status === "outgoing") {
          cleanupMedia();
          setCall(null);
          notify("Offline", `${current.peer.name} is offline right now.`);
        }
        break;
      case "call_decline":
      case "call_end":
        if (current) {
          cleanupMedia();
          setCall(null);
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {
          // ignore malformed
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, handleEvent]);

  useEffect(() => {
    if (call?.status !== "active") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [call?.status]);

  const styles = makeStyles(colors);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <CallContext.Provider value={{ startCall, sendSignal, subscribe }}>
      {children}
      <Modal visible={!!call} transparent animationType="fade">
        {call && (
          <LinearGradient
            colors={["#0B1B2E", "#14335A", "#0B1B2E"]}
            style={styles.backdrop}
            testID="call-overlay"
          >
            <View style={styles.topArea}>
              <Text style={styles.callKind}>
                {call.status === "incoming"
                  ? "Incoming audio call"
                  : call.status === "outgoing"
                    ? "Audio call"
                    : "Audio call"}
              </Text>
              {call.status === "active" && (
                <View style={styles.timerPill} testID="call-timer">
                  <View style={styles.liveDot} />
                  <Text style={styles.timerText}>
                    {mins}:{secs.toString().padStart(2, "0")}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.centerArea}>
              <View style={styles.avatarWrap}>
                {call.status !== "active" && (
                  <>
                    <PulseRing size={150} delay={0} />
                    <PulseRing size={150} delay={700} />
                    <PulseRing size={150} delay={1400} />
                  </>
                )}
                <Avatar
                  name={call.peer.name}
                  url={call.peer.avatar_url}
                  size={124}
                  frame={call.peer.active_frame}
                  isSpeaking={call.status === "active"}
                />
              </View>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{call.peer.name}</Text>
                {call.peer.is_vip ? (
                  <VipBadge tier={call.peer.vip_tier} />
                ) : null}
              </View>
              <Text style={styles.status}>
                {call.status === "incoming" && "wants to talk with you"}
                {call.status === "outgoing" && "Ringing..."}
                {call.status === "active" && (muted ? "You are muted" : "Connected")}
              </Text>
            </View>

            <View style={styles.actions}>
              {call.status === "incoming" ? (
                <>
                  <View style={styles.actionCol}>
                    <Pressable
                      testID="call-decline-btn"
                      style={[styles.actionBtn, styles.danger]}
                      onPress={declineCall}
                    >
                      <Ionicons
                        name="call"
                        size={28}
                        color="#FFF"
                        style={{ transform: [{ rotate: "135deg" }] }}
                      />
                    </Pressable>
                    <Text style={styles.actionLabel}>Decline</Text>
                  </View>
                  <View style={styles.actionCol}>
                    <Pressable
                      testID="call-accept-btn"
                      style={[styles.actionBtn, styles.accept]}
                      onPress={acceptCall}
                    >
                      <Ionicons name="call" size={28} color="#FFF" />
                    </Pressable>
                    <Text style={styles.actionLabel}>Accept</Text>
                  </View>
                </>
              ) : (
                <>
                  {call.status === "active" && (
                    <View style={styles.actionCol}>
                      <Pressable
                        testID="call-mute-btn"
                        style={[styles.actionBtn, styles.neutral, muted && styles.neutralActive]}
                        onPress={toggleMute}
                      >
                        <Ionicons
                          name={muted ? "mic-off" : "mic"}
                          size={26}
                          color="#FFF"
                        />
                      </Pressable>
                      <Text style={styles.actionLabel}>
                        {muted ? "Unmute" : "Mute"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.actionCol}>
                    <Pressable
                      testID="call-end-btn"
                      style={[styles.actionBtn, styles.danger]}
                      onPress={endCall}
                    >
                      <Ionicons
                        name="call"
                        size={28}
                        color="#FFF"
                        style={{ transform: [{ rotate: "135deg" }] }}
                      />
                    </Pressable>
                    <Text style={styles.actionLabel}>End</Text>
                  </View>
                </>
              )}
            </View>
          </LinearGradient>
        )}
      </Modal>
    </CallContext.Provider>
  );
};

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.xxl * 2,
      paddingHorizontal: spacing.xl,
    },
    topArea: {
      alignItems: "center",
      gap: spacing.md,
    },
    callKind: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: "rgba(255,255,255,0.65)",
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    timerPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#22C55E",
    },
    timerText: {
      fontFamily: fonts.displaySemi,
      fontSize: 16,
      color: "#FFFFFF",
    },
    centerArea: {
      alignItems: "center",
      gap: spacing.md,
    },
    avatarWrap: {
      width: 150,
      height: 150,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    name: {
      fontFamily: fonts.display,
      fontSize: 28,
      color: "#FFFFFF",
    },
    status: {
      fontFamily: fonts.textSemi,
      fontSize: 15,
      color: "rgba(255,255,255,0.6)",
    },
    actions: {
      flexDirection: "row",
      gap: spacing.xxl * 1.5,
      alignItems: "flex-end",
    },
    actionCol: {
      alignItems: "center",
      gap: spacing.sm,
    },
    actionBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: "center",
      justifyContent: "center",
    },
    actionLabel: {
      fontFamily: fonts.textSemi,
      fontSize: 12,
      color: "rgba(255,255,255,0.75)",
    },
    danger: {
      backgroundColor: "#EF4444",
    },
    accept: {
      backgroundColor: "#10B981",
    },
    neutral: {
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    neutralActive: {
      backgroundColor: "rgba(255,255,255,0.35)",
    },
  });
