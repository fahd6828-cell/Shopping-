import { Router } from "express";
import { z } from "zod";
import { searchProducts } from "../services/searchService.js";
import { COUNTRY_CURRENCY } from "../config.js";

const querySchema = z.object({
  query: z
    .string({ required_error: "query parameter is required" })
    .trim()
    .min(2, "query must be at least 2 characters")
    .max(200, "query too long"),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => c in COUNTRY_CURRENCY, {
      message: `country must be one of: ${Object.keys(COUNTRY_CURRENCY).join(", ")}`,
    })
    .default("SA"),
});

export const searchRouter = Router();

/**
 * GET /api/search?query=iphone+16&country=SA
 *
 * Compares total prices (item + shipping to `country`) across all
 * registered stores and attaches active coupons. Cached 3h in Redis.
 */
searchRouter.get("/search", async (req, res, next) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_request",
      details: parsed.error.issues.map((i) => i.message),
    });
  }

  try {
    const result = await searchProducts(
      parsed.data.query,
      parsed.data.country
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
