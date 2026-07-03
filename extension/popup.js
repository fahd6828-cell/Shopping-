/**
 * سوقلي — popup logic
 *
 * On open:
 *  1. Find the active tab and ask the service worker for its cached
 *     comparison (background.js populated it when the content script
 *     detected a product).
 *  2. If the tab has no comparison (unsupported page / detection missed),
 *     fall back to a manual Arabic search box that hits the API directly.
 *
 * All rendering is done with DOM APIs — no innerHTML with remote data, so
 * store/coupon strings can never inject markup.
 */

"use strict";

const API_BASE_URL = "http://localhost:3000"; // keep in sync with background.js
const app = document.getElementById("app");

const ARABIC_CURRENCY = {
  SAR: "ر.س",
  AED: "د.إ",
  KWD: "د.ك",
  EGP: "ج.م",
};

init();

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const state = tab
      ? await chrome.runtime.sendMessage({ type: "GET_COMPARISON", tabId: tab.id })
      : null;

    if (state && state.status === "ready") {
      renderComparison(state.product, state.comparison);
    } else if (state && state.status === "loading") {
      // Content script reported a product but the API round-trip is still
      // in flight — briefly poll instead of leaving a dead spinner.
      setTimeout(init, 700);
    } else if (state && state.status === "error") {
      renderError(state.error);
    } else {
      renderManualSearch();
    }
  } catch (err) {
    renderError(err.message);
  }
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function renderComparison(product, comparison) {
  app.replaceChildren();

  if (product && product.title) {
    const current = el("div", "current-product");
    current.append(
      el("div", "label", "المنتج الحالي"),
      el("div", "title", product.title)
    );
    app.append(current);
  }

  const offers = (comparison && comparison.results) || [];
  if (offers.length === 0) {
    app.append(stateMessage("لم نعثر على عروض لهذا المنتج حاليًا 😕"));
    return;
  }

  const list = el("div", "offers");
  offers.forEach((offer, index) => list.append(offerCard(offer, index === 0)));
  app.append(list);
}

function offerCard(offer, isBest) {
  const card = el("article", isBest ? "offer best" : "offer");

  // store row
  const top = el("div", "offer-top");
  top.append(el("span", "store-name", offer.store.name_ar || offer.store.name));
  if (isBest) top.append(el("span", "best-tag", "الأرخص ✓"));
  card.append(top);

  card.append(el("div", "offer-title", offer.product_title));

  // price row
  const priceRow = el("div", "price-row");
  priceRow.append(
    el("span", "total", formatPrice(offer.total_price, offer.currency))
  );
  if (offer.shipping) {
    priceRow.append(
      offer.shipping.is_free
        ? el("span", "shipping free", "شحن مجاني 🚚")
        : el(
            "span",
            "shipping",
            `شامل الشحن ${formatPrice(offer.shipping.cost, offer.currency)}` +
              ` · ${offer.shipping.est_days_min}-${offer.shipping.est_days_max} أيام`
          )
    );
  } else {
    priceRow.append(el("span", "shipping", "الشحن غير معروف"));
  }
  card.append(priceRow);

  // coupons (top 2 per store keeps the popup scannable)
  for (const coupon of (offer.coupons || []).slice(0, 2)) {
    card.append(couponRow(coupon));
  }

  // go to store
  const go = el("a", "go-btn", "الذهاب إلى المتجر ←");
  go.href = offer.product_url;
  go.target = "_blank";
  go.rel = "noopener noreferrer";
  card.append(go);

  return card;
}

function couponRow(coupon) {
  const row = el("div", "coupon");

  const info = el("div", "coupon-info");
  info.append(
    el("div", "coupon-code", coupon.code),
    el("div", "coupon-desc", coupon.description_ar)
  );

  const btn = el("button", "copy-btn", "نسخ الكود");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      btn.textContent = "تم النسخ ✓";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "نسخ الكود";
        btn.classList.remove("copied");
      }, 1800);
    } catch {
      btn.textContent = "تعذّر النسخ";
    }
  });

  row.append(info, btn);
  return row;
}

function renderManualSearch() {
  app.replaceChildren();

  const box = el("div", "search-box");
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "ابحث عن منتج… مثال: آيفون 16";
  input.dir = "auto";
  const btn = el("button", null, "قارن");
  box.append(input, btn);

  const hint = stateMessage(
    "افتح صفحة منتج في أمازون أو نون أو نمشي لمقارنة سعره تلقائيًا، أو ابحث يدويًا هنا."
  );

  app.append(box, hint);

  const run = () => {
    const query = input.value.trim();
    if (query.length < 2) return;
    manualSearch(query);
  };
  btn.addEventListener("click", run);
  input.addEventListener("keydown", (e) => e.key === "Enter" && run());
  input.focus();
}

async function manualSearch(query) {
  app.replaceChildren(stateMessage("جارٍ مقارنة الأسعار…", true));
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/search?query=${encodeURIComponent(query)}&country=SA`
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    renderComparison(null, await res.json());
  } catch (err) {
    renderError(err.message);
  }
}

function renderError(message) {
  app.replaceChildren(
    stateMessage("تعذّر الاتصال بالخادم. تأكد من تشغيل الخدمة ثم أعد المحاولة.")
  );
  console.warn("[souqly popup]", message);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function stateMessage(text, withSpinner) {
  const wrap = el("div", "state");
  if (withSpinner) wrap.append(el("div", "spinner"));
  wrap.append(el("p", null, text));
  return wrap;
}

function formatPrice(amount, currency) {
  const symbol = ARABIC_CURRENCY[currency] || currency;
  return `${amount.toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;
}
