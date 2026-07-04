import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/src/components/Avatar";
import { INTERESTS, MAX_INTERESTS } from "@/src/constants/interests";
import {
  LANGUAGES,
  langName,
} from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, assetUrl, User } from "@/src/utils/api";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];
const BLOOD_TYPES = ["A", "B", "AB", "O"];
const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const ZODIACS: { name: string; from: [number, number]; to: [number, number] }[] =
  [
    { name: "Capricorn", from: [12, 22], to: [1, 19] },
    { name: "Aquarius", from: [1, 20], to: [2, 18] },
    { name: "Pisces", from: [2, 19], to: [3, 20] },
    { name: "Aries", from: [3, 21], to: [4, 19] },
    { name: "Taurus", from: [4, 20], to: [5, 20] },
    { name: "Gemini", from: [5, 21], to: [6, 20] },
    { name: "Cancer", from: [6, 21], to: [7, 22] },
    { name: "Leo", from: [7, 23], to: [8, 22] },
    { name: "Virgo", from: [8, 23], to: [9, 22] },
    { name: "Libra", from: [9, 23], to: [10, 22] },
    { name: "Scorpio", from: [10, 23], to: [11, 21] },
    { name: "Sagittarius", from: [11, 22], to: [12, 21] },
  ];

const zodiacFor = (birthday?: string | null): string => {
  if (!birthday) return "";
  const parts = birthday.split("-");
  if (parts.length < 3) return "";
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!m || !d) return "";
  for (const z of ZODIACS) {
    if (z.name === "Capricorn") {
      if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return "Capricorn";
      continue;
    }
    if (m === z.from[0] && d >= z.from[1]) return z.name;
    if (m === z.to[0] && d <= z.to[1]) return z.name;
  }
  return "";
};

type EditorType =
  | "text"
  | "textarea"
  | "options"
  | "lang-native"
  | "lang-multi"
  | "interests"
  | "birthday"
  | "username";

interface EditorConfig {
  type: EditorType;
  title: string;
  fieldKey: string;
  choices?: { value: string; label: string }[];
  cap?: number;
  exclude?: string[];
  sub?: string;
}

export default function EditProfile() {
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editor, setEditor] = useState<EditorConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [draftArr, setDraftArr] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const persist = useCallback(
    async (patch: Record<string, unknown>) => {
      const updated = await api.put<User>("/users/me", patch);
      setUser(updated);
    },
    [setUser],
  );

  if (!user) {
    return null;
  }

  const isVip = !!user.is_vip;
  const learnCap = isVip ? 3 : 1;
  const learningLangs = user.learning_languages?.length
    ? user.learning_languages
    : user.learning_language
      ? [user.learning_language]
      : [];

  const pickImage = async (): Promise<
    { base64: string; mime: string } | null
  > => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!current.granted) {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Photos",
            "Photo access is disabled. Enable it in Settings.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert("Photos", "Photo access is needed to pick an image.");
        }
        return null;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return null;
    return { base64: asset.base64, mime: asset.mimeType || "image/jpeg" };
  };

  const changeAvatar = async () => {
    const img = await pickImage();
    if (!img) return;
    setUploadingAvatar(true);
    try {
      const updated = await api.post<User>("/users/me/avatar", {
        image_base64: img.base64,
        mime: img.mime,
      });
      setUser(updated);
    } catch {
      Alert.alert("Photo", "Could not update your photo. Try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const changeCover = async () => {
    const img = await pickImage();
    if (!img) return;
    setUploadingCover(true);
    try {
      const updated = await api.post<User>("/users/me/cover", {
        image_base64: img.base64,
        mime: img.mime,
      });
      setUser(updated);
    } catch {
      Alert.alert("Cover", "Could not update cover. Try again.");
    } finally {
      setUploadingCover(false);
    }
  };

  // ── Editor openers ──
  const openText = (
    fieldKey: string,
    title: string,
    value: string | null | undefined,
    type: "text" | "textarea" = "text",
    sub?: string,
  ) => {
    setErr(null);
    setDraft(value || "");
    setEditor({ type, title, fieldKey, sub });
  };

  const openOptions = (
    fieldKey: string,
    title: string,
    current: string | null | undefined,
    choices: { value: string; label: string }[],
  ) => {
    setErr(null);
    setDraft(current || "");
    setEditor({ type: "options", title, fieldKey, choices });
  };

  const openNative = () => {
    setErr(null);
    setDraft(user.native_language || "");
    setEditor({
      type: "lang-native",
      title: "Native language",
      fieldKey: "native_language",
    });
  };

  const openTeach = () => {
    if (!isVip) {
      Alert.alert(
        "VIP feature",
        "VIP members can teach up to 2 extra languages. Upgrade to unlock!",
        [
          { text: "Not now", style: "cancel" },
          { text: "Get VIP", onPress: () => router.push("/market") },
        ],
      );
      return;
    }
    setErr(null);
    setDraftArr(user.teach_languages || []);
    setEditor({
      type: "lang-multi",
      title: "Teaching languages",
      fieldKey: "teach_languages",
      cap: 2,
      exclude: [user.native_language || ""],
    });
  };

  const openLearn = () => {
    setErr(null);
    setDraftArr(learningLangs);
    setEditor({
      type: "lang-multi",
      title: "Learning languages",
      fieldKey: "learning_languages",
      cap: learnCap,
      exclude: [user.native_language || "", ...(user.teach_languages || [])],
    });
  };

  const openInterests = () => {
    setErr(null);
    setDraftArr(user.interests || []);
    setEditor({
      type: "interests",
      title: "Hobbies & Interests",
      fieldKey: "interests",
      cap: MAX_INTERESTS,
    });
  };

  const openBirthday = () => {
    setErr(null);
    setDraft(user.birthday || "");
    setEditor({
      type: "birthday",
      title: "Birthday",
      fieldKey: "birthday",
      sub: "Format: YYYY-MM-DD (e.g. 1998-01-01)",
    });
  };

  const openUsername = () => {
    setErr(null);
    setDraft(user.username || "");
    setEditor({
      type: "username",
      title: "HelloTalk ID",
      fieldKey: "username",
      sub: "3–20 chars: lowercase letters, numbers, _ or . · changeable once a month",
    });
  };

  const closeEditor = () => {
    if (busy) return;
    setEditor(null);
  };

  const commit = async () => {
    if (!editor || busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (editor.type === "username") {
        const updated = await api.put<User>("/users/me/username", {
          username: draft.trim().toLowerCase(),
        });
        setUser(updated);
      } else if (editor.type === "birthday") {
        const v = draft.trim();
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          setErr("Please use the format YYYY-MM-DD");
          setBusy(false);
          return;
        }
        await persist({ birthday: v });
      } else if (editor.type === "lang-multi") {
        if (editor.fieldKey === "learning_languages") {
          await persist({
            learning_languages: draftArr,
            learning_language: draftArr[0] || null,
          });
        } else {
          await persist({ teach_languages: draftArr });
        }
      } else if (editor.type === "lang-native") {
        await persist({ native_language: draft });
      } else if (editor.type === "interests") {
        await persist({ interests: draftArr });
      } else {
        await persist({ [editor.fieldKey]: draft.trim() });
      }
      setEditor(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleArr = (code: string, cap: number) => {
    setDraftArr((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= cap) return prev;
      return [...prev, code];
    });
  };

  const zodiac = zodiacFor(user.birthday);

  const Row = ({
    icon,
    iconColor,
    iconBg,
    label,
    value,
    placeholder,
    onPress,
    editText,
    dot,
    accent,
    last,
  }: {
    icon?: IconName;
    iconColor?: string;
    iconBg?: string;
    label: string;
    value?: string | null;
    placeholder?: string;
    onPress?: () => void;
    editText?: boolean;
    dot?: boolean;
    accent?: boolean;
    last?: boolean;
  }) => (
    <Pressable
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!onPress}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text
          style={[
            styles.rowValue,
            !value && styles.rowPlaceholder,
          ]}
          numberOfLines={1}
        >
          {value || placeholder || "Not set"}
        </Text>
        {accent ? <View style={styles.rowAccent} /> : null}
      </View>
      {dot ? <View style={styles.rowDot} /> : null}
      {editText ? <Text style={styles.editText}>Edit</Text> : null}
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.onSurfaceSecondary}
        />
      ) : null}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover header */}
        <View style={styles.coverWrap}>
          {user.cover_url ? (
            <Image
              source={{ uri: assetUrl(user.cover_url) || undefined }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <LinearGradient
              colors={["#7C6BF0", "#6D5AE8"]}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={[StyleSheet.absoluteFill, styles.coverGlobe]}>
            <Ionicons name="earth" size={220} color="rgba(255,255,255,0.12)" />
          </View>
          <SafeAreaView edges={["top"]} style={styles.coverBar}>
            <Pressable
              testID="edit-back-btn"
              style={styles.coverIconBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable
              testID="edit-cover-btn"
              style={styles.coverImgBtn}
              onPress={changeCover}
              disabled={uploadingCover}
            >
              {uploadingCover ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="image" size={20} color="#FFFFFF" />
              )}
            </Pressable>
          </SafeAreaView>
        </View>

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <View>
            <Avatar name={user.name} url={user.avatar_url} size={104} />
            <Pressable
              testID="edit-avatar-btn"
              style={styles.avatarCamBtn}
              onPress={changeAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={18} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>

        {/* About Me */}
        <Text style={styles.sectionHeader}>About Me</Text>
        <View style={styles.card}>
          <Row
            label="Name"
            value={user.name}
            editText
            onPress={() => openText("name", "Name", user.name)}
          />
          <Pressable
            style={[styles.row, styles.rowBorder, { alignItems: "flex-start" }]}
            onPress={() =>
              openText("bio", "Self-introduction", user.bio, "textarea")
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Self-introduction</Text>
              <View style={styles.introRow}>
                <Ionicons
                  name="volume-high"
                  size={16}
                  color={colors.brand}
                  style={{ marginTop: 3 }}
                />
                <Text
                  style={[
                    styles.rowValue,
                    !user.bio && styles.rowPlaceholder,
                    { flex: 1 },
                  ]}
                  numberOfLines={3}
                >
                  {user.bio || "Add a self-introduction so partners know you"}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.onSurfaceSecondary}
            />
          </Pressable>
        </View>

        {/* Language */}
        <Text style={styles.sectionHeader}>Language</Text>
        <View style={styles.card}>
          <Row
            label="Native"
            value={langName(user.native_language) || "Set native language"}
            accent
            onPress={openNative}
          />
          <Row
            label="Add More Teaching Languages"
            value={
              user.teach_languages?.length
                ? user.teach_languages.map((c) => langName(c)).join(", ")
                : undefined
            }
            placeholder="VIP · Teach extra languages"
            dot={!isVip}
            onPress={openTeach}
          />
          <Row
            label={`Learn ${learningLangs.length}`}
            value={
              learningLangs.length
                ? learningLangs.map((c) => langName(c)).join(", ")
                : "Pick languages to learn"
            }
            onPress={openLearn}
            last
          />
        </View>

        {/* VIP banner */}
        <Pressable
          testID="edit-vip-banner"
          style={styles.vipBanner}
          onPress={() => router.push("/market")}
        >
          <View style={styles.vipTag}>
            <Text style={styles.vipTagText}>VIP</Text>
          </View>
          <Text style={styles.vipBannerText}>Learn/Teach more languages</Text>
        </Pressable>

        {/* Interests */}
        <Text style={styles.sectionHeader}>Interests</Text>
        <View style={styles.card}>
          <Row
            icon="musical-notes"
            iconColor="#3B82F6"
            iconBg="#DBEAFE"
            label="Add Hobbies"
            value={user.interests?.length ? user.interests.join(", ") : undefined}
            placeholder="Add your hobbies"
            onPress={openInterests}
          />
          <Row
            icon="airplane"
            iconColor="#3B82F6"
            iconBg="#DBEAFE"
            label="Places I want to go"
            value={user.places_to_go}
            placeholder="Add a dream destination"
            onPress={() =>
              openText("places_to_go", "Places I want to go", user.places_to_go)
            }
            last
          />
        </View>

        {/* Personal Info */}
        <Text style={styles.sectionHeader}>Personal Info</Text>
        <View style={styles.card}>
          <Row
            icon="happy"
            iconColor="#8B5CF6"
            iconBg="#EDE9FE"
            label="My MBTI"
            value={user.mbti}
            placeholder="Choose your MBTI"
            onPress={() =>
              openOptions(
                "mbti",
                "My MBTI",
                user.mbti,
                MBTI_TYPES.map((m) => ({ value: m, label: m })),
              )
            }
          />
          <Row
            icon="water"
            iconColor="#8B5CF6"
            iconBg="#EDE9FE"
            label="My Blood Type"
            value={user.blood_type}
            placeholder="Choose blood type"
            onPress={() =>
              openOptions(
                "blood_type",
                "My Blood Type",
                user.blood_type,
                BLOOD_TYPES.map((b) => ({ value: b, label: b })),
              )
            }
          />
          <Row
            icon="home"
            iconColor="#14B8A6"
            iconBg="#CCFBF1"
            label="My Hometown"
            value={user.hometown}
            placeholder="Add your hometown"
            onPress={() => openText("hometown", "My Hometown", user.hometown)}
          />
          <Row
            icon="briefcase"
            iconColor="#14B8A6"
            iconBg="#CCFBF1"
            label="My Occupation"
            value={user.occupation}
            placeholder="Add your occupation"
            onPress={() =>
              openText("occupation", "My Occupation", user.occupation)
            }
          />
          <Row
            icon="school"
            iconColor="#14B8A6"
            iconBg="#CCFBF1"
            label="My School"
            value={user.school}
            placeholder="Add your school"
            onPress={() => openText("school", "My School", user.school)}
            last
          />
        </View>

        {/* Other */}
        <Text style={styles.sectionHeader}>Other</Text>
        <View style={styles.card}>
          <Row
            label="HelloTalk ID"
            value={user.username ? `@${user.username}` : undefined}
            placeholder="Set your ID"
            editText
            onPress={openUsername}
          />
          <Row
            label="Region"
            value={user.country}
            placeholder="Not set"
            last={false}
          />
          <Row
            label="Gender"
            value={
              user.gender
                ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
                : undefined
            }
            placeholder="Choose gender"
            onPress={() => openOptions("gender", "Gender", user.gender, GENDERS)}
          />
          <Row
            label="Birthday"
            value={user.birthday}
            placeholder="Add your birthday"
            onPress={openBirthday}
          />
          <Row
            label="My Zodiac"
            value={zodiac}
            placeholder="Set birthday to see zodiac"
            last
          />
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          testID="preview-btn"
          style={styles.previewBtn}
          onPress={() => router.push(`/user/${user.id}`)}
        >
          <Text style={styles.previewText}>Preview</Text>
        </Pressable>
        <Pressable
          testID="getvip-btn"
          style={{ flex: 1 }}
          onPress={() => router.push("/market")}
        >
          <LinearGradient
            colors={["#F97316", "#F59E0B"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.vipBtn}
          >
            <Text style={styles.vipBtnText}>Get VIP</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* ── Field editor modal ── */}
      <Modal
        visible={!!editor}
        transparent
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editorBackdrop}
        >
          <Pressable style={{ flex: 1 }} onPress={closeEditor} />
          <View style={styles.editorSheet}>
            <View style={styles.editorHandle} />
            <View style={styles.editorHeader}>
              <Pressable onPress={closeEditor} disabled={busy}>
                <Text style={styles.editorCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.editorTitle}>{editor?.title}</Text>
              <Pressable onPress={commit} disabled={busy}>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={styles.editorSave}>Save</Text>
                )}
              </Pressable>
            </View>
            {editor?.sub ? (
              <Text style={styles.editorSub}>{editor.sub}</Text>
            ) : null}

            <ScrollView
              style={{ maxHeight: 380 }}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              keyboardShouldPersistTaps="handled"
            >
              {(editor?.type === "text" ||
                editor?.type === "textarea" ||
                editor?.type === "birthday" ||
                editor?.type === "username") && (
                <TextInput
                  testID="editor-input"
                  style={[
                    styles.editorInput,
                    editor?.type === "textarea" && styles.editorTextarea,
                  ]}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={editor?.title}
                  placeholderTextColor={colors.onSurfaceSecondary}
                  multiline={editor?.type === "textarea"}
                  autoCapitalize={
                    editor?.type === "username" ? "none" : "sentences"
                  }
                  autoCorrect={editor?.type !== "username"}
                  autoFocus
                />
              )}

              {editor?.type === "options" && (
                <View style={styles.chipWrap}>
                  {editor.choices?.map((c) => {
                    const active = draft === c.value;
                    return (
                      <Pressable
                        key={c.value}
                        testID={`opt-${c.value}`}
                        onPress={() => setDraft(c.value)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {editor?.type === "lang-native" && (
                <View style={styles.chipWrap}>
                  {LANGUAGES.map((lang) => {
                    const active = draft === lang.code;
                    return (
                      <Pressable
                        key={lang.code}
                        onPress={() => setDraft(lang.code)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {lang.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {editor?.type === "lang-multi" && (
                <View style={styles.chipWrap}>
                  {LANGUAGES.filter(
                    (l) => !editor.exclude?.includes(l.code),
                  ).map((lang) => {
                    const active = draftArr.includes(lang.code);
                    return (
                      <Pressable
                        key={lang.code}
                        onPress={() => toggleArr(lang.code, editor.cap ?? 3)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {lang.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {editor?.type === "interests" && (
                <View style={styles.chipWrap}>
                  {INTERESTS.map((i) => {
                    const active = draftArr.includes(i);
                    return (
                      <Pressable
                        key={i}
                        onPress={() => toggleArr(i, editor.cap ?? MAX_INTERESTS)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {i}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {editor?.fieldKey === "learning_languages" &&
                !isVip &&
                editor?.type === "lang-multi" && (
                  <Text style={styles.editorNote}>
                    Free members learn 1 language. Upgrade to VIP for up to 3.
                  </Text>
                )}
            </ScrollView>

            {err ? (
              <Text style={styles.editorError} testID="editor-error">
                {err}
              </Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
    },
    coverWrap: {
      height: 210,
      backgroundColor: "#6D5AE8",
      overflow: "hidden",
    },
    coverGlobe: {
      alignItems: "center",
      justifyContent: "center",
    },
    coverBar: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    coverIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    coverImgBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.25)",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarWrap: {
      alignItems: "center",
      marginTop: -52,
    },
    avatarCamBtn: {
      position: "absolute",
      right: -4,
      bottom: 2,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#6D5AE8",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: colors.surfaceSecondary,
    },
    sectionHeader: {
      fontFamily: fonts.display,
      fontSize: 20,
      color: colors.onSurface,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      marginHorizontal: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      marginHorizontal: spacing.lg,
      paddingHorizontal: spacing.lg,
      ...shadow.card,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 60,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    rowIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
      marginBottom: 2,
    },
    rowValue: {
      fontFamily: fonts.textBold,
      fontSize: 17,
      color: colors.onSurface,
    },
    rowPlaceholder: {
      fontFamily: fonts.text,
      color: colors.onSurfaceSecondary,
    },
    rowAccent: {
      width: 34,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.success,
      marginTop: 4,
    },
    rowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#EC4899",
    },
    editText: {
      fontFamily: fonts.textBold,
      fontSize: 15,
      color: "#6D5AE8",
    },
    introRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
    },
    vipBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      paddingVertical: spacing.lg,
      ...shadow.card,
    },
    vipTag: {
      backgroundColor: "#F59E0B",
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    vipTagText: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: "#FFFFFF",
      letterSpacing: 0.5,
    },
    vipBannerText: {
      fontFamily: fonts.textBold,
      fontSize: 16,
      color: colors.onSurface,
    },
    bottomBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    previewBtn: {
      flex: 1,
      backgroundColor: "#6D5AE8",
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    previewText: {
      fontFamily: fonts.textBold,
      fontSize: 16,
      color: "#FFFFFF",
    },
    vipBtn: {
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    vipBtnText: {
      fontFamily: fonts.textBold,
      fontSize: 16,
      color: "#FFFFFF",
    },
    // Editor
    editorBackdrop: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.5)",
      justifyContent: "flex-end",
    },
    editorSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    editorHandle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginBottom: spacing.sm,
    },
    editorHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    editorTitle: {
      fontFamily: fonts.display,
      fontSize: 17,
      color: colors.onSurface,
    },
    editorCancel: {
      fontFamily: fonts.textSemi,
      fontSize: 15,
      color: colors.onSurfaceSecondary,
    },
    editorSave: {
      fontFamily: fonts.textBold,
      fontSize: 15,
      color: "#6D5AE8",
    },
    editorSub: {
      fontFamily: fonts.text,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
      lineHeight: 17,
    },
    editorInput: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: fonts.text,
      fontSize: 16,
      color: colors.onSurface,
      marginTop: spacing.sm,
    },
    editorTextarea: {
      minHeight: 110,
      textAlignVertical: "top",
    },
    editorNote: {
      fontFamily: fonts.text,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
      marginTop: spacing.sm,
    },
    editorError: {
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: colors.error,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    chipActive: {
      backgroundColor: colors.brandTertiary,
    },
    chipText: {
      fontFamily: fonts.textSemi,
      fontSize: 14,
      color: colors.onSurfaceTertiary,
    },
    chipTextActive: {
      color: colors.onBrandTertiary,
      fontFamily: fonts.textBold,
    },
  });
