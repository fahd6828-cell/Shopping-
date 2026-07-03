import { config } from "../config.js";

/**
 * Push notifications via Firebase Cloud Messaging.
 *
 * Env-gated like every external integration: without
 * FIREBASE_SERVICE_ACCOUNT_JSON the notifier runs in dry-run mode —
 * notifications are logged with full payloads instead of sent, so the
 * whole alert pipeline is testable locally.
 */

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Deep-link data for the app (listing id, store URL, ...). */
  data?: Record<string, string>;
}

interface PushResult {
  delivered: boolean;
  dryRun: boolean;
  error?: string;
}

let messagingPromise: Promise<import("firebase-admin/messaging").Messaging | null> | null =
  null;

/** Lazily initialize firebase-admin only when credentials exist. */
function getMessaging() {
  messagingPromise ??= (async () => {
    if (!config.firebaseServiceAccountJson) return null;
    const { initializeApp, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const app = initializeApp({
      credential: cert(JSON.parse(config.firebaseServiceAccountJson)),
    });
    return getMessaging(app);
  })();
  return messagingPromise;
}

export async function sendPush(message: PushMessage): Promise<PushResult> {
  const messaging = await getMessaging();

  if (!messaging) {
    console.log(
      `[push:dry-run] to=${message.token.slice(0, 12)}… title="${message.title}" body="${message.body}"`,
      message.data ?? {}
    );
    return { delivered: false, dryRun: true };
  }

  try {
    await messaging.send({
      token: message.token,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });
    return { delivered: true, dryRun: false };
  } catch (err) {
    // Invalid/expired tokens are routine (app reinstalls) — callers decide
    // whether to clear the token; we just report.
    return { delivered: false, dryRun: false, error: (err as Error).message };
  }
}
