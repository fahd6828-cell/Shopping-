import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";

export const listingsRouter = Router();

/**
 * GET /api/listings/:id/history — price series for the mobile sparkline.
 * Capped at the most recent 90 points, returned oldest-first for drawing.
 */
listingsRouter.get("/listings/:id/history", async (req, res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: "invalid_listing_id" });
  }
  try {
    const { rows } = await pool.query<{
      price: number;
      currency: string;
      recorded_at: Date;
    }>(
      `SELECT price, currency, recorded_at
         FROM (SELECT price, currency, recorded_at
                 FROM price_history
                WHERE listing_id = $1
                ORDER BY recorded_at DESC
                LIMIT 90) recent
        ORDER BY recorded_at ASC`,
      [req.params.id]
    );
    res.json({
      listing_id: req.params.id,
      points: rows.map((r) => ({
        price: r.price,
        currency: r.currency,
        at: r.recorded_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});
