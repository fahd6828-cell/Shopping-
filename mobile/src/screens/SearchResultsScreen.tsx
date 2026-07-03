import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  searchProducts,
  type SearchResponseDto,
  type StoreOfferDto,
} from "../api/client";
import { MOCK_SEARCH_RESPONSE } from "../api/mockData";
import { ProductCard } from "../components/ProductCard";
import { colors, radius, spacing } from "../theme";

interface Props {
  initialQuery?: string;
  /** Shopper country — drives currency and shipping (SA, AE, KW, EG). */
  country?: string;
  /** Development flag: render bundled mock data if the API is unreachable. */
  fallbackToMock?: boolean;
}

type ScreenState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; response: SearchResponseDto }
  | { kind: "error"; message: string };

/**
 * شاشة نتائج البحث — Arabic-first search-results screen.
 *
 * Layout notes: the app entry point calls I18nManager.forceRTL(true), so
 * every flexDirection:"row" below mirrors automatically and text aligns
 * right without per-component hacks.
 */
export function SearchResultsScreen({
  initialQuery = "",
  country = "SA",
  fallbackToMock = true,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<ScreenState>({ kind: "idle" });
  const inflight = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 2) return;

      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;

      setState({ kind: "loading" });
      try {
        const response = await searchProducts(trimmed, country, controller.signal);
        setState({ kind: "ready", response });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (fallbackToMock) {
          // Development convenience: show the fixture instead of a dead end.
          setState({ kind: "ready", response: MOCK_SEARCH_RESPONSE });
        } else {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    [country, fallbackToMock]
  );

  useEffect(() => {
    if (initialQuery) void runSearch(initialQuery);
    return () => inflight.current?.abort();
  }, [initialQuery, runSearch]);

  return (
    <View style={styles.screen}>
      {/* search header */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void runSearch(query)}
          placeholder="ابحث عن منتج… مثال: آيفون 16"
          placeholderTextColor={colors.inkSoft}
          returnKeyType="search"
          textAlign="right"
        />
        <Pressable
          style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.85 }]}
          onPress={() => void runSearch(query)}
          accessibilityRole="button"
          accessibilityLabel="قارن الأسعار"
        >
          <Text style={styles.searchBtnText}>قارن</Text>
        </Pressable>
      </View>

      {state.kind === "idle" && (
        <CenteredNote text="اكتب اسم المنتج لمقارنة أسعاره في كل المتاجر 🛍️" />
      )}

      {state.kind === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={styles.centerText}>جارٍ مقارنة الأسعار…</Text>
        </View>
      )}

      {state.kind === "error" && (
        <CenteredNote text={`تعذّر جلب النتائج: ${state.message}`} danger />
      )}

      {state.kind === "ready" && (
        <ResultsList response={state.response} />
      )}
    </View>
  );
}

function ResultsList({ response }: { response: SearchResponseDto }) {
  const renderItem = useCallback(
    ({ item, index }: { item: StoreOfferDto; index: number }) => (
      <ProductCard offer={item} isBest={index === 0} />
    ),
    []
  );

  if (response.results.length === 0) {
    return <CenteredNote text="لا توجد نتائج لهذا البحث 😕" />;
  }

  return (
    <FlatList
      data={response.results}
      renderItem={renderItem}
      keyExtractor={(item) => `${item.store.slug}:${item.product_url}`}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Text style={styles.summary}>
          {response.results.length} عروض · مرتبة من الأرخص (شامل الشحن)
          {response.cached ? " · من الذاكرة المؤقتة" : ""}
        </Text>
      }
      ListFooterComponent={
        response.failed_stores.length > 0 ? (
          <Text style={styles.failedNote}>
            تعذّر الوصول إلى: {response.failed_stores.join("، ")}
          </Text>
        ) : null
      }
    />
  );
}

function CenteredNote({ text, danger }: { text: string; danger?: boolean }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.centerText, danger && { color: colors.danger }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBar: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  searchBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  searchBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  list: { padding: spacing.md },
  summary: {
    fontSize: 12,
    color: colors.inkSoft,
    marginBottom: spacing.sm,
    textAlign: "right",
  },
  failedNote: {
    fontSize: 11,
    color: colors.danger,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  centerText: { color: colors.inkSoft, fontSize: 14, textAlign: "center" },
});
