import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  getPriceHistory,
  type PricePointDto,
  type TrackedItemDto,
} from "../api/client";
import { Sparkline } from "../components/Sparkline";
import { colors, formatPriceAr, radius, spacing } from "../theme";

interface Props {
  item: TrackedItemDto;
}

/**
 * Listing details: current price, change since save, and the price-history
 * sparkline served by GET /api/listings/:id/history.
 */
export function ProductDetailsScreen({ item }: Props) {
  const [points, setPoints] = useState<PricePointDto[] | null>(null);
  const [error, setError] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    getPriceHistory(item.listing_id)
      .then((p) => !cancelled && setPoints(p))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [item.listing_id]);

  const delta = item.current_price - item.price_at_save;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{item.name_ar ?? item.canonical_name}</Text>
      <Text style={styles.store}>{item.store_name_ar}</Text>

      <View style={styles.priceCard}>
        <Text style={styles.currentPrice}>
          {formatPriceAr(item.current_price, item.currency)}
        </Text>
        <Text style={styles.savedAt}>
          كان {formatPriceAr(item.price_at_save, item.currency)} عند الحفظ
          {delta !== 0 && (
            <Text style={delta < 0 ? styles.down : styles.up}>
              {"  "}
              ({delta < 0 ? "↓" : "↑"} {formatPriceAr(Math.abs(delta), item.currency)})
            </Text>
          )}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>سجل السعر</Text>
      <View style={styles.chartCard}>
        {points === null && !error && (
          <ActivityIndicator color={colors.green} style={styles.chartLoading} />
        )}
        {error && <Text style={styles.chartError}>تعذّر تحميل سجل الأسعار</Text>}
        {points !== null && (
          <Sparkline points={points} width={width - spacing.md * 4} />
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.goBtn, pressed && { opacity: 0.9 }]}
        onPress={() => void Linking.openURL(item.store_product_url)}
        accessibilityRole="link"
      >
        <Text style={styles.goBtnText}>افتح في {item.store_name_ar} ←</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  name: { fontSize: 17, fontWeight: "800", color: colors.ink, textAlign: "left" },
  store: { fontSize: 12, color: colors.inkSoft },
  priceCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  currentPrice: { fontSize: 26, fontWeight: "800", color: colors.greenDark },
  savedAt: { fontSize: 12, color: colors.inkSoft },
  down: { color: colors.green, fontWeight: "700" },
  up: { color: colors.danger, fontWeight: "700" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    marginTop: spacing.md,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  chartLoading: { paddingVertical: spacing.xl },
  chartError: { fontSize: 12, color: colors.inkSoft, paddingVertical: spacing.lg },
  goBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  goBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
