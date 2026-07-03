# Souqly Mobile — تطبيق سوقلي

React Native (TypeScript) app shell for Souqly: bottom-tab navigation (بحث / المتتبَّعة / الإعدادات), price tracking with a history sparkline, and full Arabic RTL. Native projects (`ios/`, `android/`) are not committed — generate them and copy this folder's files in:

```bash
npx @react-native-community/cli init SouqlyApp --version 0.75.4
# then copy App.tsx, index.js, src/ and merge package.json dependencies
cd ios && pod install   # iOS
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

## Files

| File | Purpose |
|------|---------|
| `App.tsx` | Bottom tabs (بحث / المتتبَّعة / الإعدادات) + details stack |
| `index.js` | Entry point — forces RTL before registration |
| `src/screens/SearchResultsScreen.tsx` | Search + offers list, silent re-poll while backend refreshes |
| `src/screens/TrackedProductsScreen.tsx` | Tracked listings with change-since-save (↓ green / ↑ red) |
| `src/screens/ProductDetailsScreen.tsx` | Current price + history sparkline (`/api/listings/:id/history`) |
| `src/screens/SettingsScreen.tsx` | Country picker, persisted + synced to the device profile |
| `src/components/ProductCard.tsx` | One store offer: price, shipping, total, coupons, track button |
| `src/components/CouponButton.tsx` | "انسخ الكوبون وتوجه للمتجر" — copy code then open store |
| `src/components/TrackButton.tsx` | "🔔 تتبّع السعر" — subscribes to price-drop pushes |
| `src/components/Sparkline.tsx` | Pure react-native-svg polyline, no chart library |
| `src/api/client.ts` | Typed client: search, device registration, tracking, history |
| `src/api/mockData.ts` | Offline fixture matching the API contract |
| `src/theme.ts` | Colors, spacing, Arabic-friendly typography |

## Type check

```bash
npm install
npm run typecheck
```
