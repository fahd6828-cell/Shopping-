import { Image, StyleSheet, Text, View } from "react-native";
import type { StoreOfferDto } from "../api/client";
import { colors, formatPriceAr, radius, spacing } from "../theme";
import { CouponButton } from "./CouponButton";

interface Props {
  offer: StoreOfferDto;
  /** First card in the (already sorted) list = cheapest total. */
  isBest: boolean;
}

/**
 * One store's offer: store name, product, total price (item + shipping),
 * shipping details, and the store's active coupons.
 */
export function ProductCard({ offer, isBest }: Props) {
  return (
    <View style={[styles.card, isBest && styles.cardBest]}>
      <View style={styles.headerRow}>
        <View style={styles.storeInfo}>
          {offer.store.logo_url ? (
            <Image source={{ uri: offer.store.logo_url }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoFallbackText}>
                {offer.store.name_ar.charAt(0)}
              </Text>
            </View>
          )}
          <Text style={styles.storeName}>{offer.store.name_ar}</Text>
        </View>
        {isBest && (
          <View style={styles.bestTag}>
            <Text style={styles.bestTagText}>أفضل سعر ✓</Text>
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {offer.product_title}
      </Text>

      <View style={styles.priceRow}>
        <Text style={styles.total}>
          {formatPriceAr(offer.total_price, offer.currency)}
        </Text>
        <Text style={[styles.shipping, offer.shipping?.is_free && styles.free]}>
          {shippingLabel(offer)}
        </Text>
      </View>

      {!offer.in_stock && <Text style={styles.outOfStock}>غير متوفر حاليًا</Text>}

      {offer.coupons.map((coupon) => (
        <CouponButton
          key={coupon.code}
          coupon={coupon}
          storeUrl={offer.product_url}
        />
      ))}
    </View>
  );
}

function shippingLabel(offer: StoreOfferDto): string {
  if (!offer.shipping) return "الشحن غير معروف";
  if (offer.shipping.is_free) return "شحن مجاني 🚚";
  return (
    `شامل الشحن ${formatPriceAr(offer.shipping.cost, offer.currency)}` +
    ` · ${offer.shipping.est_days_min}-${offer.shipping.est_days_max} أيام`
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardBest: { borderColor: colors.green, borderWidth: 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storeInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: { width: 28, height: 28, borderRadius: radius.sm },
  logoFallback: {
    backgroundColor: colors.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { color: "#FFF", fontWeight: "700" },
  storeName: { fontSize: 14, fontWeight: "700", color: colors.ink },
  bestTag: {
    backgroundColor: colors.green,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  bestTagText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  title: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: spacing.xs,
    textAlign: "right",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  total: { fontSize: 18, fontWeight: "800", color: colors.greenDark },
  shipping: { fontSize: 11, color: colors.inkSoft },
  free: { color: colors.green, fontWeight: "600" },
  outOfStock: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "600",
    marginTop: spacing.xs,
    textAlign: "right",
  },
});
