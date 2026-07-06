// Firebase Cloud Messaging adapter. Lazily initializes the Admin SDK from a
// service account (inline JSON in FCM_SERVICE_ACCOUNT, or a path in
// FCM_SERVICE_ACCOUNT_PATH). If credentials are missing/invalid the factory in
// notifications.ts keeps using the stub, so nothing here runs until you opt in.
import fs from "fs";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/db/prisma";
import { log } from "./logger";
import type {
  DeliveryResult,
  NotificationSender,
  PushMessage,
} from "./notifications";

function loadServiceAccount(): Record<string, unknown> | null {
  const inline = process.env.FCM_SERVICE_ACCOUNT;
  const path = process.env.FCM_SERVICE_ACCOUNT_PATH;
  try {
    if (inline) return JSON.parse(inline);
    if (path) return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (e) {
    log.error("Failed to load FCM service account", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return null;
}

export class FcmSender implements NotificationSender {
  readonly mode = "fcm";
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  // Returns an FcmSender if credentials are present & valid, else null.
  static tryCreate(): FcmSender | null {
    const sa = loadServiceAccount();
    if (!sa) return null;
    try {
      const app =
        getApps()[0] ??
        initializeApp({
          credential: cert(sa as Parameters<typeof cert>[0]),
          projectId: process.env.FCM_PROJECT_ID || (sa.project_id as string),
        });
      log.info("FCM sender initialized");
      return new FcmSender(app);
    } catch (e) {
      log.error("FCM init failed; falling back to stub", {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  async send(tokens: string[], msg: PushMessage): Promise<DeliveryResult> {
    if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };
    const messaging = getMessaging(this.app);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data: msg.data ?? {},
    });

    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        invalidTokens.push(tokens[i]);
      }
    });

    // Prune dead tokens so we stop pushing to uninstalled apps.
    if (invalidTokens.length) {
      await prisma.device
        .deleteMany({ where: { fcmToken: { in: invalidTokens } } })
        .catch(() => {});
      log.info("Pruned invalid FCM tokens", { count: invalidTokens.length });
    }

    return {
      sent: res.successCount,
      failed: res.failureCount,
      invalidTokens,
    };
  }
}
