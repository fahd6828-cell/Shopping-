import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import type { CouponDto } from "../api/client";
import { colors, radius, spacing } from "../theme";

interface Props {
  coupon: CouponDto;
  /** Store page to open after the code is copied. */
  storeUrl: string;
}

/**
 * "انسخ الكوبون وتوجه للمتجر" — copies the coupon code to the clipboard,
 * flashes confirmation, then deep-links to the store so the user can paste
 * the code at checkout.
 */
export function CouponButton({ coupon, storeUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const onPress = useCallback(async () => {
    Clipboard.setString(coupon.code);
    setCopied(true);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);

    try {
      await Linking.openURL(storeUrl);
    } catch {
      Alert.alert("تعذّر فتح المتجر", "تم نسخ الكوبون، افتح المتجر يدويًا.");
    }
  }, [coupon.code, storeUrl]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.info}>
        <Text style={styles.code}>{coupon.code}</Text>
        <Text style={styles.description} numberOfLines={1}>
          {coupon.description_ar}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`انسخ كوبون ${coupon.code} وتوجه للمتجر`}
        style={({ pressed }) => [
          styles.button,
          copied && styles.buttonCopied,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>
          {copied ? "تم النسخ ✓" : "انسخ الكوبون وتوجه للمتجر"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row", // auto-mirrors under I18nManager RTL
    alignItems: "center",
    backgroundColor: colors.goldBg,
    borderColor: colors.gold,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  info: { flex: 1, minWidth: 0 },
  code: {
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 1,
    color: colors.gold,
    writingDirection: "ltr", // codes are Latin — keep LTR inside RTL layout
    textAlign: "right",
  },
  description: { fontSize: 11, color: colors.inkSoft, textAlign: "right" },
  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: 150,
  },
  buttonCopied: { backgroundColor: colors.green },
  buttonPressed: { opacity: 0.85 },
  buttonText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
});
