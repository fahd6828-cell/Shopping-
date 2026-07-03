import { createHash, createHmac } from "node:crypto";
import { config } from "../config.js";

/**
 * Minimal Amazon Product Advertising API 5 client with hand-rolled AWS
 * Signature V4 — no AWS SDK dependency for one endpoint.
 *
 * PA-API 5 reference: https://webservices.amazon.com/paapi5/documentation/
 * SigV4 reference:    https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 *
 * The signer (`signAwsV4`) is a pure function of its inputs (timestamp
 * included), verified in tests against the battle-tested `aws4` package.
 */

export interface AwsV4SignInput {
  method: string;
  host: string;
  path: string; // must be already URI-encoded, no query string here
  /** Lowercase header names. host/x-amz-date are added automatically. */
  headers: Record<string, string>;
  payload: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  /** e.g. "20260703T104500Z" */
  amzDate: string;
}

export interface AwsV4SignResult {
  authorization: string;
  /** All headers to send, including the signed ones. */
  headers: Record<string, string>;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export function signAwsV4(input: AwsV4SignInput): AwsV4SignResult {
  const dateStamp = input.amzDate.slice(0, 8);

  const allHeaders: Record<string, string> = {
    ...input.headers,
    host: input.host,
    "x-amz-date": input.amzDate,
  };

  const sortedNames = Object.keys(allHeaders)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${allHeaders[name]!.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    input.method.toUpperCase(),
    input.path,
    "", // canonical query string (PA-API uses POST with empty query)
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.payload),
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${input.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, headers: { ...allHeaders, authorization } };
}

/* ------------------------------------------------------------------ */
/* PA-API SearchItems                                                  */
/* ------------------------------------------------------------------ */

export interface PaapiMarketplaceConfig {
  /** e.g. "webservices.amazon.sa" */
  host: string;
  /** PA-API region for the marketplace (eu-west-1 for .sa/.ae). */
  region: string;
  /** e.g. "www.amazon.sa" */
  marketplace: string;
}

export function isPaapiConfigured(): boolean {
  return Boolean(
    config.paapi.accessKey && config.paapi.secretKey && config.paapi.partnerTag
  );
}

const SEARCH_ITEMS_RESOURCES = [
  "ItemInfo.Title",
  "ItemInfo.ByLineInfo",
  "Images.Primary.Large",
  "Offers.Listings.Price",
  "Offers.Listings.Availability.Type",
];

/**
 * Calls PA-API SearchItems. The response type matches PaApiSearchResponse
 * in amazonAdapter.ts — the mock is intentionally the same shape.
 */
export async function paapiSearchItems(
  marketplaceCfg: PaapiMarketplaceConfig,
  keywords: string,
  signal: AbortSignal
): Promise<unknown> {
  const path = "/paapi5/searchitems";
  const payload = JSON.stringify({
    Keywords: keywords,
    PartnerTag: config.paapi.partnerTag,
    PartnerType: "Associates",
    Marketplace: marketplaceCfg.marketplace,
    ItemCount: 5,
    Resources: SEARCH_ITEMS_RESOURCES,
  });

  const amzDate = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const { headers } = signAwsV4({
    method: "POST",
    host: marketplaceCfg.host,
    path,
    headers: {
      "content-encoding": "amz-1.0",
      "content-length": String(Buffer.byteLength(payload, "utf8")),
      "content-type": "application/json; charset=utf-8",
      "x-amz-target":
        "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
    },
    payload,
    region: marketplaceCfg.region,
    service: "ProductAdvertisingAPI",
    accessKey: config.paapi.accessKey,
    secretKey: config.paapi.secretKey,
    amzDate,
  });

  const response = await fetch(`https://${marketplaceCfg.host}${path}`, {
    method: "POST",
    headers,
    body: payload,
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PA-API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}
