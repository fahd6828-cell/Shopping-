import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  getTracked,
  untrackListing,
  type TrackedItemDto,
} from "../api/client";
import { colors, formatPriceAr, radius, spacing } from "../theme";

interface Props {
  /** Navigate to the details screen (sparkline) for a tracked listing. */
  onOpenListing?: (item: TrackedItemDto) => void;
}

/**
 * "المتتبَّعة" — listings this device watches, with the change since save:
 * green ↓ for drops (the good direction for a shopper), red ↑ for rises.
 */
export function TrackedProductsScreen({ onOpenListing }: Props) {
  const [items, setItems] = useState<TrackedItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await getTracked());
    } catch {
      // Keep whatever we had; pull-to-refresh retries.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh whenever the tab gains focus (a track may have just happened).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const remove = useCallback(
    (item: TrackedItemDto) => {
      Alert.alert("إيقاف التتبّع", `هل تريد إيقاف تتبّع ${item.name_ar ?? item.canonical_name}؟`, [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إيقاف",
          style: "destructive",
          onPress: async () => {
            setItems((prev) => prev.filter((i) => i.listing_id !== item.listing_id));
            try {
              await untrackListing(item.listing_id);
            } catch {
              void load(); // restore truth on failure
            }
          },
        },
      ]);
    },
    [load]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>لا توجد منتجات متتبَّعة</Text>
        <Text style={styles.emptyBody}>
          ابحث عن منتج واضغط "تتبّع السعر" لتصلك إشعارات عند انخفاض سعره 🔔
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.listing_id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.green}
        />
      }
      renderItem={({ item }) => (
        <TrackedRow item={item} onOpen={onOpenListing} onRemove={remove} />
      )}
    />
  );
}

function TrackedRow({
  item,
  onOpen,
  onRemove,
}: {
  item: TrackedItemDto;
  onOpen?: (item: TrackedItemDto) => void;
  onRemove: (item: TrackedItemDto) => void;
}) {
  const delta = item.current_price - item.price_at_save;
  const dropped = delta < 0;

  return (
    <Pressable
      onPress={() => onOpen?.(item)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
    >
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name_ar ?? item.canonical_name}
        </Text>
        <Text style={styles.store}>{item.store_name_ar}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatPriceAr(item.current_price, item.currency)}
          </Text>
          {delta !== 0 && (
            <Text style={[styles.delta, dropped ? styles.down : styles.up]}>
              {dropped ? "↓" : "↑"} {formatPriceAr(Math.abs(delta), item.currency)}
            </Text>
          )}
          {!item.in_stock && <Text style={styles.oos}>غير متوفر</Text>}
        </View>
      </View>
      <Pressable
        onPress={() => onRemove(item)}
        hitSlop={8}
        accessibilityLabel="إيقاف التتبّع"
        style={styles.removeBtn}
      >
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  emptyBody: { fontSize: 13, color: colors.inkSoft, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowMain: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "700", color: colors.ink, textAlign: "left" },
  store: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },
  price: { fontSize: 15, fontWeight: "800", color: colors.greenDark },
  delta: { fontSize: 12, fontWeight: "700" },
  down: { color: colors.green },
  up: { color: colors.danger },
  oos: { fontSize: 11, color: colors.danger, fontWeight: "600" },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.inkSoft, fontSize: 13 },
});
