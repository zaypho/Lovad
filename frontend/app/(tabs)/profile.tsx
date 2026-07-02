import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Linking,
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
import { LanguagePair } from "@/src/components/LanguagePair";
import { countryToCode } from "@/src/constants/countries";
import { INTERESTS, MAX_INTERESTS } from "@/src/constants/interests";
import {
  LANGUAGES,
  PROFICIENCY_LEVELS,
  langName,
} from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, shadow, spacing, ThemeColors } from "@/src/theme";
import { api, User } from "@/src/utils/api";

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const { colors, mode, toggleMode } = useTheme();
  const router = useRouter();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [country, setCountry] = useState(user?.country || "");
  const [nativeLang, setNativeLang] = useState(user?.native_language || null);
  const [teachLangs, setTeachLangs] = useState<string[]>(
    user?.teach_languages || [],
  );
  const [learningLangs, setLearningLangs] = useState<string[]>(
    user?.learning_languages?.length
      ? user.learning_languages
      : user?.learning_language
        ? [user.learning_language]
        : [],
  );
  const [proficiency, setProficiency] = useState(user?.proficiency || null);
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [age, setAge] = useState(user?.age ? String(user.age) : "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ count: number }>("/users/me/visitors")
        .then((d) => setVisitorCount(d.count))
        .catch(() => {});
      api
        .get<User>("/auth/me")
        .then(setUser)
        .catch(() => {});
    }, [setUser]),
  );

  if (!user) return null;

  const daysMember = user.created_at
    ? Math.max(1, dayjs().diff(dayjs(user.created_at), "day") + 1)
    : 1;

  const toggleList = (
    list: string[],
    set: (v: string[]) => void,
    code: string,
    max: number,
  ) => {
    if (list.includes(code)) set(list.filter((c) => c !== code));
    else if (list.length < max) set([...list, code]);
  };

  const toggleSection = (key: string) => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded((prev) => (prev === key ? null : key));
  };

  const pickAvatar = async () => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!current.granted) {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Photos",
            "Photo access is disabled. Enable it in Settings to set a profile photo.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert("Photos", "Photo access is needed to set your profile photo.");
        }
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    setUploadingAvatar(true);
    try {
      const updated = await api.post<User>("/users/me/avatar", {
        image_base64: asset.base64,
        mime: asset.mimeType || "image/jpeg",
      });
      setUser(updated);
    } catch {
      Alert.alert("Photo", "Could not update your photo. Try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const ageNum = parseInt(age, 10);
      const updated = await api.put<User>("/users/me", {
        name: name.trim() || user.name,
        bio,
        country,
        native_language: nativeLang,
        teach_languages: teachLangs.filter((c) => c !== nativeLang),
        learning_languages: learningLangs,
        learning_language: learningLangs[0] || null,
        proficiency,
        interests,
        age: !Number.isNaN(ageNum) && ageNum >= 13 && ageNum <= 120 ? ageNum : undefined,
      });
      setUser(updated);
      setEditing(false);
    } catch {
      // stay in edit mode for retry
    } finally {
      setSaving(false);
    }
  };

  const doLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Me</Text>
          <Pressable
            testID={editing ? "profile-save-btn" : "profile-edit-btn"}
            onPress={() => (editing ? save() : setEditing(true))}
            style={styles.editBtn}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Text style={styles.editBtnText}>
                {editing ? "Save" : "Edit Profile"}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View>
            <Avatar
              name={user.name}
              url={user.avatar_url}
              size={80}
              flagCode={countryToCode(user.country)}
            />
            <Pressable
              testID="avatar-edit-btn"
              style={styles.avatarEditBtn}
              onPress={pickAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.onBrand} />
              ) : (
                <Ionicons name="camera" size={13} color={colors.onBrand} />
              )}
            </Pressable>
          </View>
          {editing ? (
            <TextInput
              testID="profile-name-input"
              style={[styles.input, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.onSurfaceSecondary}
            />
          ) : (
            <Text style={styles.name}>{user.name}</Text>
          )}
          <Text style={styles.email}>{user.email}</Text>
          <LanguagePair
            native={editing ? nativeLang : user.native_language}
            teach={editing ? teachLangs : user.teach_languages}
            learning={
              editing
                ? learningLangs
                : user.learning_languages?.length
                  ? user.learning_languages
                  : user.learning_language
            }
          />
          {user.proficiency && !editing && (
            <Text style={styles.proficiency}>
              {langName(user.learning_language)} · {user.proficiency}
            </Text>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statCell} testID="profile-streak-stat">
              <View style={styles.statValueRow}>
                <Ionicons name="flame" size={16} color={colors.warning} />
                <Text style={styles.statValue}>{user.streak_count ?? 0}</Text>
              </View>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
            <View style={styles.statDivider} />
            <Pressable
              testID="profile-views-stat"
              style={styles.statCell}
              onPress={() => router.push("/visitors")}
            >
              <View style={styles.statValueRow}>
                <Ionicons name="eye" size={16} color={colors.brand} />
                <Text style={styles.statValue}>{visitorCount ?? 0}</Text>
              </View>
              <Text style={styles.statLabel}>Profile Views</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <View style={styles.statCell} testID="profile-days-stat">
              <View style={styles.statValueRow}>
                <Ionicons name="calendar" size={16} color={colors.success} />
                <Text style={styles.statValue}>{daysMember}</Text>
              </View>
              <Text style={styles.statLabel}>Days Member</Text>
            </View>
          </View>
        </View>

        <Text style={styles.groupLabel}>Profile details</Text>
        <View style={styles.section}>
          <Pressable
            testID="profile-views-row"
            style={styles.settingRow}
            onPress={() => router.push("/visitors")}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="eye" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Profile Views</Text>
              <Text style={styles.settingSub}>
                {visitorCount ?? 0} {visitorCount === 1 ? "person" : "people"} visited your profile
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.onSurfaceSecondary}
            />
          </Pressable>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About me</Text>
          {editing ? (
            <TextInput
              testID="profile-bio-input"
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell partners about yourself..."
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
            />
          ) : (
            <Text style={styles.bodyText}>
              {user.bio || "No bio yet. Tap Edit to add one!"}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Country</Text>
          {editing && !user.country ? (
            <TextInput
              testID="profile-country-input"
              style={styles.input}
              value={country}
              onChangeText={setCountry}
              placeholder="Where are you from?"
              placeholderTextColor={colors.onSurfaceSecondary}
            />
          ) : (
            <View style={styles.lockedRow}>
              <Text style={styles.bodyText}>{user.country || "Not set"}</Text>
              {user.country ? (
                <Ionicons
                  name="lock-closed"
                  size={13}
                  color={colors.onSurfaceSecondary}
                />
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Age</Text>
          {editing && !user.age ? (
            <TextInput
              testID="profile-age-input"
              style={styles.input}
              value={age}
              onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ""))}
              placeholder="Your age"
              placeholderTextColor={colors.onSurfaceSecondary}
              keyboardType="number-pad"
              maxLength={3}
            />
          ) : (
            <View style={styles.lockedRow}>
              <Text style={styles.bodyText}>
                {user.age ? `${user.age} years old` : "Not set"}
              </Text>
              {user.age ? (
                <Ionicons
                  name="lock-closed"
                  size={13}
                  color={colors.onSurfaceSecondary}
                />
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Interests{editing ? ` (${interests.length}/${MAX_INTERESTS})` : ""}
          </Text>
          {editing ? (
            <View style={styles.chipWrap}>
              {INTERESTS.map((i) => {
                const active = interests.includes(i);
                return (
                  <Pressable
                    key={i}
                    testID={`profile-interest-${i.toLowerCase().replace(/\s/g, "-")}`}
                    onPress={() =>
                      toggleList(interests, setInterests, i, MAX_INTERESTS)
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {i}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : user.interests?.length ? (
            <View style={styles.chipWrap}>
              {user.interests.map((i) => (
                <View key={i} style={[styles.chip, styles.chipActive]}>
                  <Text style={[styles.chipText, styles.chipTextActive]}>{i}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.bodyText}>
              No interests yet. Tap Edit to add some!
            </Text>
          )}
        </View>

        {editing && (
          <>
            <View style={styles.section}>
              <Pressable
                testID="collapse-native"
                style={styles.collapseHeader}
                onPress={() => toggleSection("native")}
              >
                <Text style={styles.sectionTitle}>Native language</Text>
                <View style={styles.collapseRight}>
                  {nativeLang ? <FlagIcon code={nativeLang} size={16} /> : null}
                  <Ionicons
                    name={expanded === "native" ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.onSurfaceSecondary}
                  />
                </View>
              </Pressable>
              {expanded === "native" && (
              <View style={styles.chipWrap}>
                {LANGUAGES.map((lang) => {
                  const active = nativeLang === lang.code;
                  return (
                    <Pressable
                      key={lang.code}
                      testID={`profile-native-${lang.code}`}
                      onPress={() => {
                        setNativeLang(lang.code);
                        setTeachLangs((prev) =>
                          prev.filter((c) => c !== lang.code),
                        );
                        setLearningLangs((prev) =>
                          prev.filter((c) => c !== lang.code),
                        );
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <FlagIcon code={lang.code} size={14} />
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
            </View>
            <View style={styles.section}>
              <Pressable
                testID="collapse-teach"
                style={styles.collapseHeader}
                onPress={() => toggleSection("teach")}
              >
                <Text style={styles.sectionTitle}>
                  I can also teach ({teachLangs.length}/2)
                </Text>
                <View style={styles.collapseRight}>
                  {teachLangs.map((c) => (
                    <FlagIcon key={c} code={c} size={16} />
                  ))}
                  <Ionicons
                    name={expanded === "teach" ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.onSurfaceSecondary}
                  />
                </View>
              </Pressable>
              {expanded === "teach" && (
              <View style={styles.chipWrap}>
                {LANGUAGES.filter((l) => l.code !== nativeLang).map((lang) => {
                  const active = teachLangs.includes(lang.code);
                  return (
                    <Pressable
                      key={lang.code}
                      testID={`profile-teach-${lang.code}`}
                      onPress={() => {
                        toggleList(teachLangs, setTeachLangs, lang.code, 2);
                        setLearningLangs((prev) =>
                          prev.filter((c) => c !== lang.code),
                        );
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <FlagIcon code={lang.code} size={14} />
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
            </View>
            <View style={styles.section}>
              <Pressable
                testID="collapse-learning"
                style={styles.collapseHeader}
                onPress={() => toggleSection("learning")}
              >
                <Text style={styles.sectionTitle}>
                  Learning languages ({learningLangs.length}/3)
                </Text>
                <View style={styles.collapseRight}>
                  {learningLangs.map((c) => (
                    <FlagIcon key={c} code={c} size={16} />
                  ))}
                  <Ionicons
                    name={expanded === "learning" ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.onSurfaceSecondary}
                  />
                </View>
              </Pressable>
              {expanded === "learning" && (
              <View style={styles.chipWrap}>
                {LANGUAGES.filter(
                  (l) => l.code !== nativeLang && !teachLangs.includes(l.code),
                ).map((lang) => {
                  const active = learningLangs.includes(lang.code);
                  return (
                    <Pressable
                      key={lang.code}
                      testID={`profile-learning-${lang.code}`}
                      onPress={() =>
                        toggleList(learningLangs, setLearningLangs, lang.code, 3)
                      }
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <FlagIcon code={lang.code} size={14} />
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
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Level</Text>
              <View style={styles.chipWrap}>
                {PROFICIENCY_LEVELS.map((level) => {
                  const active = proficiency === level;
                  return (
                    <Pressable
                      key={level}
                      testID={`profile-level-${level.toLowerCase()}`}
                      onPress={() => setProficiency(level)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {level}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        <Text style={styles.groupLabel}>Settings</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="moon" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Dark mode</Text>
              <Text style={styles.settingSub}>
                {mode === "dark" ? "On — easy on the eyes" : "Off — bright & friendly"}
              </Text>
            </View>
            <View style={styles.modeToggle}>
              <Pressable
                testID="mode-light-btn"
                onPress={() => mode === "dark" && toggleMode()}
                style={[
                  styles.modeOpt,
                  mode === "light" && styles.modeOptActive,
                ]}
              >
                <Ionicons
                  name="sunny"
                  size={16}
                  color={mode === "light" ? colors.onBrand : colors.onSurfaceSecondary}
                />
              </Pressable>
              <Pressable
                testID="mode-dark-btn"
                onPress={() => mode === "light" && toggleMode()}
                style={[styles.modeOpt, mode === "dark" && styles.modeOptActive]}
              >
                <Ionicons
                  name="moon"
                  size={16}
                  color={mode === "dark" ? colors.onBrand : colors.onSurfaceSecondary}
                />
              </Pressable>
            </View>
          </View>
          <View style={styles.settingDivider} />
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="language" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Native language</Text>
              <Text style={styles.settingSub}>
                {langName(user.native_language)} — partners learn this from you
              </Text>
            </View>
            <FlagIcon code={user.native_language} size={22} />
          </View>
          <View style={styles.settingDivider} />
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="school" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Learning</Text>
              <Text style={styles.settingSub}>
                {(user.learning_languages?.length
                  ? user.learning_languages
                  : user.learning_language
                    ? [user.learning_language]
                    : []
                )
                  .map((c) => langName(c))
                  .join(", ") || "Not set"}
                {user.proficiency ? ` · ${user.proficiency}` : ""} — tap Edit
                Profile to change
              </Text>
            </View>
            <FlagIcon code={user.learning_language} size={22} />
          </View>
        </View>

        <Text style={styles.groupLabel}>About</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="chatbubbles" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>LinguaConnect</Text>
              <Text style={styles.settingSub}>
                Version 1.1 · Language exchange, AI tools, voice rooms & calls
              </Text>
            </View>
          </View>
        </View>

        <Pressable testID="logout-btn" style={styles.logoutBtn} onPress={doLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
    },
    scroll: {
      padding: spacing.xl,
      paddingBottom: spacing.xxxl,
      gap: spacing.lg,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerTitle: {
      fontFamily: fonts.display,
      fontSize: 28,
      color: colors.onSurface,
    },
    editBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
    },
    editBtnText: {
      fontFamily: fonts.textBold,
      fontSize: 14,
      color: colors.onBrandTertiary,
    },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.md,
      ...shadow.card,
    },
    avatarEditBtn: {
      position: "absolute",
      bottom: -2,
      left: -6,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surface,
    },
    lockedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    collapseHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 28,
    },
    collapseRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    name: {
      fontFamily: fonts.display,
      fontSize: 22,
      color: colors.onSurface,
    },
    email: {
      fontFamily: fonts.text,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    proficiency: {
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    statCell: {
      flex: 1,
      alignItems: "center",
      gap: 2,
    },
    statValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statValue: {
      fontFamily: fonts.display,
      fontSize: 18,
      color: colors.onSurface,
    },
    statLabel: {
      fontFamily: fonts.textSemi,
      fontSize: 11,
      color: colors.onSurfaceSecondary,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      height: 32,
      backgroundColor: colors.borderStrong,
    },
    groupLabel: {
      fontFamily: fonts.textBold,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginTop: spacing.sm,
      marginBottom: -spacing.sm,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...shadow.card,
    },
    sectionTitle: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.onSurfaceSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bodyText: {
      fontFamily: fonts.text,
      fontSize: 15,
      lineHeight: 22,
      color: colors.onSurface,
    },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: fonts.text,
      fontSize: 15,
      color: colors.onSurface,
    },
    nameInput: {
      alignSelf: "stretch",
      textAlign: "center",
    },
    bioInput: {
      minHeight: 80,
      textAlignVertical: "top",
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    chipActive: {
      backgroundColor: colors.brandTertiary,
    },
    chipText: {
      fontFamily: fonts.textSemi,
      fontSize: 13,
      color: colors.onSurfaceTertiary,
    },
    chipTextActive: {
      color: colors.onBrandTertiary,
      fontFamily: fonts.textBold,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    settingIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    settingTitle: {
      fontFamily: fonts.textBold,
      fontSize: 15,
      color: colors.onSurface,
    },
    settingSub: {
      fontFamily: fonts.text,
      fontSize: 12,
      color: colors.onSurfaceSecondary,
      marginTop: 1,
    },
    settingDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      marginVertical: spacing.xs,
    },
    modeToggle: {
      flexDirection: "row",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.pill,
      padding: 3,
      gap: 2,
    },
    modeOpt: {
      width: 34,
      height: 28,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    modeOptActive: {
      backgroundColor: colors.brand,
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
      ...shadow.card,
    },
    logoutText: {
      fontFamily: fonts.textBold,
      fontSize: 15,
      color: colors.error,
    },
  });
