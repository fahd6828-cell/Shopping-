# Souqly — سوقلي 🛍️

**Smart shopping assistant for the Arab market** — compare prices across Amazon SA/AE, Noon, and Namshi, auto-find working coupons, and get notified when prices drop. Arabic-first (RTL) across mobile and browser extension.

**مساعد التسوق الذكي للسوق العربي** — قارن الأسعار بين أمازون السعودية والإمارات ونون ونمشي، واحصل على كوبونات الخصم تلقائيًا، وتنبيهات عند انخفاض الأسعار.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  Mobile App      │     │ Browser Extension │
│  (React Native)  │     │ (Manifest V3)     │
└────────┬────────┘     └────────┬─────────┘
         │      HTTPS / JSON      │
         └───────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │  Backend API           │
        │  Node.js + Express +TS │
        │  GET /api/search       │
        └──────┬──────────┬──────┘
               │          │
        ┌──────▼───┐  ┌───▼─────┐     ┌──────────────────┐
        │ Redis    │  │ Postgres │     │ Store adapters    │
        │ 3h price │  │ stores,  │     │ Amazon SA · Noon  │
        │ cache    │  │ coupons, │◄────│ (mock now; swap   │
        └──────────┘  │ history  │     │ PA-API/Playwright)│
                      └──────────┘     └──────────────────┘
```

## Repository layout

| Path         | What it is |
|--------------|------------|
| `backend/`   | Express + TypeScript API, PostgreSQL schema (`backend/db/`), Redis caching |
| `extension/` | Manifest V3 browser extension (Chrome/Edge; Safari via converter), Arabic RTL popup |
| `mobile/`    | React Native components for the Arabic search-results screen |

## Quick start

### 1. Infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

Schema (`backend/db/schema.sql`) and seed data (`backend/db/seed.sql`) are applied automatically on first boot.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev          # http://localhost:3000
```

Try it:

```bash
curl "http://localhost:3000/api/search?query=iphone+16&country=SA"
```

The second identical call within 3 hours is served from Redis (`"cached": true`).

### 3. Browser extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Visit a product page on amazon.sa / amazon.ae / noon.com / namshi.com and click the extension icon.

### 4. Mobile

`mobile/src/` contains the typed screen components (`SearchResultsScreen`, `ProductCard`, `CouponButton`). Drop them into a React Native app initialized with `npx @react-native-community/cli init` — see `mobile/README.md` for RTL setup (`I18nManager.forceRTL(true)`).

## Database design (Phase 1)

Normalized 3NF schema — see `backend/db/schema.sql` for full commentary:

- `users` — accounts, country, language, push token
- `stores` — supported stores + URL detection patterns + affiliate tags
- `products` — canonical product identity (one row per real-world product)
- `product_listings` — product × store (URL, current price, stock) — the join entity
- `price_history` — append-only snapshots per listing
- `coupons` — codes with validity window, crowd success/fail counters, partial index on active
- `tracked_products` — user price-drop subscriptions
- `shipping_rates` — per store × destination country, powers **final price = item + shipping**

## Roadmap / production notes

- Swap mock adapters for Amazon PA-API + Playwright scrapers (`backend/src/adapters/`)
- Background jobs (BullMQ) for listing refresh + price-drop push notifications (FCM)
- Auth (JWT) for tracked products; rate limiting on `/api/search`
