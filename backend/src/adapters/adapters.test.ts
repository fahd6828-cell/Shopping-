import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import aws4 from "aws4";
import { describe, expect, it } from "vitest";
import { signAwsV4 } from "./paapiClient.js";
import {
  ScrapeBlockedError,
  parseNoonPrice,
  parseNoonSearchHtml,
} from "./noonScraper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* AWS SigV4 — verify our signer against the reference aws4 package    */
/* ------------------------------------------------------------------ */

describe("signAwsV4", () => {
  const cases = [
    {
      name: "PA-API SearchItems shape",
      host: "webservices.amazon.sa",
      path: "/paapi5/searchitems",
      region: "eu-west-1",
      service: "ProductAdvertisingAPI",
      payload: JSON.stringify({ Keywords: "iphone 16", PartnerTag: "souqly-21" }),
      headers: {
        "content-encoding": "amz-1.0",
        "content-type": "application/json; charset=utf-8",
        "x-amz-target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
      },
    },
    {
      name: "arabic payload",
      host: "webservices.amazon.ae",
      path: "/paapi5/searchitems",
      region: "eu-west-1",
      service: "ProductAdvertisingAPI",
      payload: JSON.stringify({ Keywords: "آيفون ١٦" }),
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  ] as const;

  it.each(cases)("matches the aws4 reference signature: $name", (tc) => {
    const amzDate = "20260703T104500Z";
    const accessKey = "AKIDEXAMPLE";
    const secretKey = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

    // aws4 always signs content-length; include it so header sets match.
    const contentLength = String(Buffer.byteLength(tc.payload, "utf8"));
    const ours = signAwsV4({
      method: "POST",
      host: tc.host,
      path: tc.path,
      headers: { ...tc.headers, "content-length": contentLength },
      payload: tc.payload,
      region: tc.region,
      service: tc.service,
      accessKey,
      secretKey,
      amzDate,
    });

    const reference = aws4.sign(
      {
        method: "POST",
        host: tc.host,
        path: tc.path,
        region: tc.region,
        service: tc.service,
        body: tc.payload,
        headers: { ...tc.headers, "X-Amz-Date": amzDate },
      },
      { accessKeyId: accessKey, secretAccessKey: secretKey }
    );

    expect(ours.authorization).toBe(reference.headers?.Authorization);
  });
});

/* ------------------------------------------------------------------ */
/* Noon search page parser                                             */
/* ------------------------------------------------------------------ */

describe("parseNoonSearchHtml", () => {
  const fixture = readFileSync(
    join(__dirname, "../../test/fixtures/noon-search.html"),
    "utf8"
  );

  it("extracts SKUs, names, prices and stock state from the fixture", () => {
    const hits = parseNoonSearchHtml(fixture);
    expect(hits).toHaveLength(3); // 4 cards, one has no product link

    const [iphoneBlack, iphoneTeal, cover] = hits;

    expect(iphoneBlack).toMatchObject({
      sku: "N70106183V",
      price: 3449.0, // sticker price (price-was)
      sale_price: 3249.0, // discounted price (price-now)
      is_buyable: true,
    });
    expect(iphoneBlack!.name).toContain("آيفون 16");

    // Arabic-Indic digits parsed, no sale price present
    expect(iphoneTeal).toMatchObject({
      sku: "N70106184W",
      price: 3299.0,
      sale_price: null,
    });

    expect(cover).toMatchObject({ sku: "N70200300Z", is_buyable: false });
  });

  it("classifies a bot-wall page as BLOCKED, never as empty results", () => {
    const blockedHtml = `<html><body>
      <div id="px-captcha"></div>
      <p>Please verify you are a human</p>
    </body></html>`;
    expect(() => parseNoonSearchHtml(blockedHtml)).toThrow(ScrapeBlockedError);
  });

  it("returns [] for a genuinely result-free page", () => {
    expect(
      parseNoonSearchHtml("<html><body><p>لا توجد نتائج</p></body></html>")
    ).toEqual([]);
  });
});

describe("parseNoonPrice", () => {
  it("handles western digits with thousands separators", () => {
    expect(parseNoonPrice("3,249.00")).toBe(3249);
  });
  it("handles Arabic-Indic digits and separators", () => {
    expect(parseNoonPrice("٣٬٢٩٩٫٥٠")).toBe(3299.5);
  });
  it("handles currency prefixes", () => {
    expect(parseNoonPrice("AED 149.00")).toBe(149);
  });
  it("returns null when no digits", () => {
    expect(parseNoonPrice("مجانًا")).toBeNull();
  });
});
