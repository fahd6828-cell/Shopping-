import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { COUNTRY_CURRENCY } from "../config.js";

/**
 * Device registration + price tracking.
 *
 * Auth model (deliberately minimal for this stage): the mobile app
 * generates a UUID once, registers it via POST /api/users/device, and
 * sends it as X-Device-Id on subsequent calls. Full account auth (JWT,
 * email/password) can attach to the same users row later.
 * PRODUCTION NOTE: device_id is a bearer secret — enforce HTTPS and add
 * per-device rate limiting before public launch.
 */

export const trackingRouter = Router();

/* ---------- device registration ---------- */

const deviceSchema = z.object({
  device_id: z.string().uuid(),
  push_token: z.string().min(10).max(4096).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => c in COUNTRY_CURRENCY)
    .default("SA"),
});

trackingRouter.post("/users/device", async (req, res, next) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_request",
      details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const { device_id, push_token, country } = parsed.data;

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (device_id, push_token, country_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id) DO UPDATE
         SET push_token   = COALESCE(EXCLUDED.push_token, users.push_token),
             country_code = EXCLUDED.country_code
       RETURNING id`,
      [device_id, push_token ?? null, country]
    );
    res.status(201).json({ user_id: rows[0]!.id });
  } catch (err) {
    next(err);
  }
});

/* ---------- device auth middleware ---------- */

interface DeviceRequest extends Request {
  userId?: string;
}

async function requireDevice(
  req: DeviceRequest,
  res: Response,
  next: NextFunction
) {
  const deviceId = req.header("X-Device-Id");
  if (!deviceId || !z.string().uuid().safeParse(deviceId).success) {
    return res.status(401).json({ error: "missing_or_invalid_device_id" });
  }
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE device_id = $1`,
      [deviceId]
    );
    if (!rows[0]) return res.status(401).json({ error: "unknown_device" });
    req.userId = rows[0].id;
    next();
  } catch (err) {
    next(err);
  }
}

/* ---------- track / untrack / list ---------- */

const trackSchema = z.object({
  listing_id: z.string().uuid(),
  target_price: z.number().positive().optional(),
});

trackingRouter.post("/track", requireDevice, async (req: DeviceRequest, res, next) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const { listing_id, target_price } = parsed.data;

  try {
    const listing = await pool.query<{ current_price: number }>(
      `SELECT current_price FROM product_listings WHERE id = $1`,
      [listing_id]
    );
    if (!listing.rows[0]) {
      return res.status(404).json({ error: "listing_not_found" });
    }

    await pool.query(
      `INSERT INTO tracked_products (user_id, listing_id, target_price, price_at_save)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, listing_id) DO UPDATE
         SET target_price = EXCLUDED.target_price,
             notified_at = NULL`,
      [req.userId, listing_id, target_price ?? null, listing.rows[0].current_price]
    );
    res.status(201).json({ tracked: true });
  } catch (err) {
    next(err);
  }
});

trackingRouter.get("/tracked", requireDevice, async (req: DeviceRequest, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.listing_id,
              t.target_price,
              t.price_at_save,
              t.created_at AS tracked_at,
              p.canonical_name,
              p.name_ar,
              p.image_url,
              s.slug AS store_slug,
              s.name_ar AS store_name_ar,
              l.current_price,
              l.currency,
              l.in_stock,
              l.store_product_url
         FROM tracked_products t
         JOIN product_listings l ON l.id = t.listing_id
         JOIN products p ON p.id = l.product_id
         JOIN stores s   ON s.id = l.store_id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC`,
      [req.userId]
    );
    res.json({ tracked: rows });
  } catch (err) {
    next(err);
  }
});

trackingRouter.delete(
  "/track/:listingId",
  requireDevice,
  async (req: DeviceRequest, res, next) => {
    if (!z.string().uuid().safeParse(req.params.listingId).success) {
      return res.status(400).json({ error: "invalid_listing_id" });
    }
    try {
      const result = await pool.query(
        `DELETE FROM tracked_products WHERE user_id = $1 AND listing_id = $2`,
        [req.userId, req.params.listingId]
      );
      res.json({ removed: (result.rowCount ?? 0) > 0 });
    } catch (err) {
      next(err);
    }
  }
);
