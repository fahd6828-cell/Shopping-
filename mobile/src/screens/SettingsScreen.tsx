import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getCountry, setCountry } from "../api/client";
import { colors, radius, spacing } from "../theme";

const COUNTRIES = [
  { code: "SA", label: "السعودية 🇸🇦" },
  { code: "AE", label: "الإمارات 🇦🇪" },
  { code: "KW", label: "الكويت 🇰🇼" },
  { code: "EG", label: "مصر 🇪🇬" },
];

/**
 * "الإعدادات" — shopper country selection. Persisted in AsyncStorage and
 * synced to the backend device profile (drives currency, shipping
 * estimates, and push copy).
 */
export function SettingsScreen() {
  const [selected, setSelected] = useState<string>("SA");

  useEffect(() => {
    void getCountry().then(setSelected);
  }, []);

  const choose = (code: string) => {
    setSelected(code);
    void setCountry(code);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>الدولة</Text>
      <Text style={styles.sectionHint}>
        تُحسب أسعار الشحن والعملة النهائية حسب دولتك
      </Text>

      <View style={styles.group}>
        {COUNTRIES.map(({ code, label }, index) => (
          <Pressable
            key={code}
            onPress={() => choose(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === code }}
            style={({ pressed }) => [
              styles.option,
              index < COUNTRIES.length - 1 && styles.optionDivider,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.optionLabel}>{label}</Text>
            <View style={[styles.radio, selected === code && styles.radioOn]}>
              {selected === code && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.about}>
        سوقلي v0.2 — مساعد التسوق الذكي للسوق العربي 🛍️
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  sectionHint: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  optionLabel: { fontSize: 14, color: colors.ink },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.green },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
  },
  about: {
    marginTop: "auto",
    textAlign: "center",
    fontSize: 11,
    color: colors.inkSoft,
    paddingVertical: spacing.lg,
  },
});
