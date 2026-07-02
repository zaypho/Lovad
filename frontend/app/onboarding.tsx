import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FlagIcon } from "@/src/components/FlagIcon";
import { COUNTRIES, countryFlagUrl } from "@/src/constants/countries";
import { INTERESTS, MAX_INTERESTS } from "@/src/constants/interests";
import { LANGUAGES } from "@/src/constants/languages";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, radius, spacing, ThemeColors } from "@/src/theme";
import { api, User } from "@/src/utils/api";

const MAX_TEACH = 2;
const MAX_LEARN = 3;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [nativeLang, setNativeLang] = useState<string | null>(null);
  const [teachLangs, setTeachLangs] = useState<string[]>([]);
  const [learnLangs, setLearnLangs] = useState<string[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const steps = [
    {
      title: "What's your native language?",
      subtitle: "You'll help others learn it.",
    },
    {
      title: "Other languages you can teach?",
      subtitle: `Optional — pick up to ${MAX_TEACH} more languages you speak well.`,
    },
    {
      title: "Which languages do you want to learn?",
      subtitle: `Pick up to ${MAX_LEARN}. We'll match you with native speakers.`,
    },
    {
      title: "Where are you from?",
      subtitle: "Your country flag appears on your profile. This can't be changed later.",
    },
    {
      title: "How old are you?",
      subtitle: "Shown on your profile. This can't be changed later.",
    },
    {
      title: "What do you love?",
      subtitle: `Pick up to ${MAX_INTERESTS} interests to find like-minded partners.`,
    },
  ];
  const lastStep = steps.length - 1;

  const ageNum = parseInt(age, 10);
  const ageValid = !Number.isNaN(ageNum) && ageNum >= 13 && ageNum <= 120;

  const canContinue =
    (step === 0 && !!nativeLang) ||
    step === 1 ||
    (step === 2 && learnLangs.length > 0) ||
    (step === 3 && !!country) ||
    (step === 4 && ageValid) ||
    (step === 5 && interests.length > 0);

  const toggleIn = (
    list: string[],
    set: (v: string[]) => void,
    code: string,
    max: number,
  ) => {
    if (list.includes(code)) {
      set(list.filter((c) => c !== code));
    } else if (list.length < max) {
      set([...list, code]);
    }
  };

  const next = async () => {
    setError(null);
    if (step < lastStep) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const updated = await api.put<User>("/users/me", {
        native_language: nativeLang,
        teach_languages: teachLangs,
        learning_languages: learnLangs,
        learning_language: learnLangs[0],
        country: COUNTRIES.find((c) => c.code === country)?.name,
        age: ageNum,
        interests,
      });
      setUser(updated);
      router.replace("/(tabs)/connect");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const renderLangGrid = (
    isSelected: (code: string) => boolean,
    onSelect: (code: string) => void,
    excluded: string[],
    testPrefix: string,
  ) => (
    <View style={styles.grid}>
      {LANGUAGES.filter((l) => !excluded.includes(l.code)).map((lang) => {
        const active = isSelected(lang.code);
        return (
          <Pressable
            key={lang.code}
            testID={`${testPrefix}-${lang.code}`}
            onPress={() => onSelect(lang.code)}
            style={[styles.langChip, active && styles.langChipActive]}
          >
            <FlagIcon code={lang.code} size={20} />
            <Text style={[styles.langName, active && styles.langNameActive]}>
              {lang.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} testID="onboarding-screen">
      <View style={styles.progressRow}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[styles.progressDot, i <= step && styles.progressDotActive]}
          />
        ))}
      </View>
      <Text style={styles.title}>{steps[step].title}</Text>
      <Text style={styles.subtitle}>{steps[step].subtitle}</Text>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        >
          {step === 0 &&
            renderLangGrid(
              (c) => nativeLang === c,
              (c) => setNativeLang(c),
              [],
              "onboarding-lang",
            )}
          {step === 1 &&
            renderLangGrid(
              (c) => teachLangs.includes(c),
              (c) => toggleIn(teachLangs, setTeachLangs, c, MAX_TEACH),
              nativeLang ? [nativeLang] : [],
              "onboarding-teach",
            )}
          {step === 2 &&
            renderLangGrid(
              (c) => learnLangs.includes(c),
              (c) => toggleIn(learnLangs, setLearnLangs, c, MAX_LEARN),
              [nativeLang, ...teachLangs].filter(Boolean) as string[],
              "onboarding-learn",
            )}
          {step === 3 && (
            <View style={styles.grid}>
              {COUNTRIES.map((c) => {
                const active = country === c.code;
                return (
                  <Pressable
                    key={c.code}
                    testID={`onboarding-country-${c.code}`}
                    onPress={() => setCountry(c.code)}
                    style={[styles.langChip, active && styles.langChipActive]}
                  >
                    <Image
                      source={{ uri: countryFlagUrl(c.code) }}
                      style={styles.countryFlag}
                      contentFit="cover"
                    />
                    <Text
                      style={[styles.langName, active && styles.langNameActive]}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {step === 4 && (
            <View style={styles.ageBox}>
              <TextInput
                testID="onboarding-age-input"
                style={styles.ageInput}
                value={age}
                onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ""))}
                placeholder="18"
                placeholderTextColor={colors.onSurfaceSecondary}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.ageHint}>
                {age && !ageValid ? "Enter an age between 13 and 120" : "years old"}
              </Text>
            </View>
          )}
          {step === 5 && (
            <>
              <Text style={styles.counter}>
                {interests.length}/{MAX_INTERESTS} selected
              </Text>
              <View style={styles.grid}>
                {INTERESTS.map((i) => {
                  const active = interests.includes(i);
                  return (
                    <Pressable
                      key={i}
                      testID={`onboarding-interest-${i.toLowerCase().replace(/\s/g, "-")}`}
                      onPress={() =>
                        toggleIn(interests, setInterests, i, MAX_INTERESTS)
                      }
                      style={[styles.langChip, active && styles.langChipActive]}
                    >
                      <Text
                        style={[styles.langName, active && styles.langNameActive]}
                      >
                        {i}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>

        {error && (
          <Text testID="onboarding-error-text" style={styles.error}>
            {error}
          </Text>
        )}

        <View style={styles.footer}>
          {step > 0 && (
            <Pressable
              testID="onboarding-back-btn"
              onPress={() => setStep(step - 1)}
              style={styles.backBtn}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            testID="onboarding-continue-btn"
            onPress={next}
            disabled={!canContinue || busy}
            style={[styles.continueBtn, (!canContinue || busy) && { opacity: 0.4 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.continueText}>
                {step === lastStep
                  ? "Start Connecting"
                  : step === 1 && teachLangs.length === 0
                    ? "Skip"
                    : "Continue"}
              </Text>
            )}
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
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.xl,
    },
    progressRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.xl,
    },
    progressDot: {
      flex: 1,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    progressDotActive: {
      backgroundColor: colors.brand,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 26,
      color: colors.onSurface,
    },
    subtitle: {
      fontFamily: fonts.text,
      fontSize: 15,
      color: colors.onSurfaceSecondary,
      marginTop: spacing.sm,
      marginBottom: spacing.xl,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    langChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 2,
      borderColor: "transparent",
    },
    langChipActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    langName: {
      fontFamily: fonts.textSemi,
      fontSize: 14,
      color: colors.onSurfaceTertiary,
    },
    langNameActive: {
      color: colors.onBrandTertiary,
      fontFamily: fonts.textBold,
    },
    countryFlag: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    ageBox: {
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xl,
    },
    ageInput: {
      width: 140,
      textAlign: "center",
      fontFamily: fonts.display,
      fontSize: 44,
      color: colors.onSurface,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
    },
    ageHint: {
      fontFamily: fonts.textSemi,
      fontSize: 14,
      color: colors.onSurfaceSecondary,
    },
    counter: {
      fontFamily: fonts.textBold,
      fontSize: 13,
      color: colors.brand,
      marginBottom: spacing.md,
    },
    error: {
      color: colors.error,
      fontFamily: fonts.textSemi,
      fontSize: 13,
      marginBottom: spacing.sm,
    },
    footer: {
      flexDirection: "row",
      gap: spacing.md,
      paddingVertical: spacing.lg,
    },
    backBtn: {
      paddingHorizontal: spacing.xl,
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    backText: {
      fontFamily: fonts.textBold,
      color: colors.onSurfaceTertiary,
      fontSize: 15,
    },
    continueBtn: {
      flex: 1,
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    continueText: {
      color: colors.onBrand,
      fontFamily: fonts.textBold,
      fontSize: 16,
    },
  });
