import pg from "pg";
import { config } from "../config.js";

/**
 * Single shared connection pool. pg parses NUMERIC as string by default to
 * avoid float precision loss; we opt into number parsing because all money
 * values fit safely and the API serves JSON numbers.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => parseFloat(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // Idle-client errors (e.g. DB restart) must not crash the process.
  console.error("[db] idle client error", err.message);
});
