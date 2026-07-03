# Souqly Mobile — واجهة نتائج البحث

React Native (TypeScript) components for the Arabic search-results screen. This folder is a **component library**, not a full app shell — drop `src/` into an app created with:

```bash
npx @react-native-community/cli init SouqlyApp --version 0.75.4
```

## RTL setup (once, in your app's entry point)

```ts
// index.js — before registering the root component
import { I18nManager } from "react-native";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);   // Arabic-first app
// A reload is required the first time RTL flips (RNRestart.Restart()).
```

With RTL forced, React Native mirrors `flexDirection: "row"` automatically, and the styles in `src/theme.ts` use logical properties (`marginStart` / `paddingEnd`) so nothing needs per-direction overrides.

## Usage

```tsx
import { SearchResultsScreen } from "./src/screens/SearchResultsScreen";

// Renders live results from the backend, or bundled mock data when
// the API is unreachable (development mode).
<SearchResultsScreen initialQuery="آيفون 16" country="SA" />
```

## Files

| File | Purpose |
|------|---------|
| `src/screens/SearchResultsScreen.tsx` | Search header + loading/empty/error states + offers list |
| `src/components/ProductCard.tsx` | One store offer: price, shipping, total, coupons |
| `src/components/CouponButton.tsx` | "انسخ الكوبون وتوجه للمتجر" — copy code then open store |
| `src/api/client.ts` | Typed fetch to `GET /api/search`, mirrors backend DTOs |
| `src/api/mockData.ts` | Offline fixture matching the API contract |
| `src/theme.ts` | Colors, spacing, Arabic-friendly typography |

## Type check

```bash
npm install
npm run typecheck
```
