import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Line, Circle } from "react-native-svg";
import type { PricePointDto } from "../api/client";
import { colors, formatPriceAr, spacing } from "../theme";

interface Props {
  points: PricePointDto[];
  width?: number;
  height?: number;
}

/**
 * Minimal price sparkline — a pure SVG polyline, no chart library.
 * Shows min/max labels and a dot on the latest point; green when the
 * latest price is at/below the series average, red otherwise.
 */
export function Sparkline({ points, width = 300, height = 72 }: Props) {
  if (points.length < 2) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>لا يوجد سجل أسعار كافٍ بعد</Text>
      </View>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1; // flat series still renders mid-height
  const pad = 6;

  const x = (i: number) =>
    pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (price: number) =>
    pad + (1 - (price - min) / span) * (height - pad * 2);

  const svgPoints = points.map((p, i) => `${x(i)},${y(p.price)}`).join(" ");

  const latest = prices[prices.length - 1]!;
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lineColor = latest <= average ? colors.green : colors.danger;
  const currency = points[points.length - 1]!.currency;

  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1={pad}
          y1={y(min)}
          x2={width - pad}
          y2={y(min)}
          stroke={colors.line}
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <Polyline
          points={svgPoints}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle
          cx={x(points.length - 1)}
          cy={y(latest)}
          r={4}
          fill={lineColor}
        />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>
          الأدنى: {formatPriceAr(min, currency)}
        </Text>
        <Text style={styles.label}>
          الأعلى: {formatPriceAr(max, currency)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  label: { fontSize: 11, color: colors.inkSoft },
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 12, color: colors.inkSoft },
});
