import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { trackListing } from "../api/client";
import { colors, radius, spacing } from "../theme";

interface Props {
  listingId: string | null;
}

type TrackState = "idle" | "saving" | "tracked" | "error";

/** "🔔 تتبّع السعر" — subscribes this device to price-drop alerts. */
export function TrackButton({ listingId }: Props) {
  const [state, setState] = useState<TrackState>("idle");

  if (!listingId) return null; // offer not yet persisted server-side

  const onPress = async () => {
    if (state === "saving" || state === "tracked") return;
    setState("saving");
    try {
      await trackListing(listingId);
      setState("tracked");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  const label =
    state === "tracked"
      ? "يتم تتبّع السعر ✓"
      : state === "error"
        ? "تعذّر الحفظ — أعد المحاولة"
        : "🔔 تتبّع السعر";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="تتبّع سعر هذا المنتج"
      style={({ pressed }) => [
        styles.button,
        state === "tracked" && styles.tracked,
        pressed && { opacity: 0.85 },
      ]}
    >
      {state === "saving" ? (
        <ActivityIndicator size="small" color={colors.greenDark} />
      ) : (
        <Text style={[styles.text, state === "tracked" && styles.trackedText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  tracked: { backgroundColor: colors.green, borderColor: colors.green },
  text: { color: colors.greenDark, fontSize: 12, fontWeight: "700" },
  trackedText: { color: "#FFF" },
});
