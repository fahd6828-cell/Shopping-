/**
 * Shared helpers for the development-mode mock adapters. Mocks stay
 * deterministic per query so caching/comparison behavior is reproducible.
 */

export function simulateNetwork(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("adapter timeout"));
      },
      { once: true }
    );
  });
}

/** Deterministic per-query hash so mock prices are stable across calls. */
export function hashQuery(query: string): number {
  let h = 0;
  for (const ch of query.toLowerCase()) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h;
}

export function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => w[0]!.toUpperCase() + w.slice(1));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
