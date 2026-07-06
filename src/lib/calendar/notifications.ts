// Notification delivery abstraction. The reminder scheduler talks only to this
// interface, so swapping the stub for a real Firebase Cloud Messaging adapter in
// Phase 4 is a one-file change with zero scheduler edits.
import { log } from "./logger";

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface DeliveryResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

export interface NotificationSender {
  readonly mode: string;
  send(tokens: string[], msg: PushMessage): Promise<DeliveryResult>;
}

// No-op sender used until FCM credentials + the Flutter app exist. It records
// what *would* have been sent so reminders are observable in logs/reports.
class StubSender implements NotificationSender {
  readonly mode = "stub";
  async send(tokens: string[], msg: PushMessage): Promise<DeliveryResult> {
    log.info("push:stub", {
      title: msg.title,
      body: msg.body,
      deviceCount: tokens.length,
    });
    return { sent: 0, failed: 0, invalidTokens: [] };
  }
}

let sender: NotificationSender | null = null;

// Factory. Returns a real FcmSender when FCM_* env vars are populated and valid;
// otherwise a no-op stub. Cached after first resolution. Async so firebase-admin
// (a heavy, node-only dependency) is dynamically imported only when configured.
export async function getSender(): Promise<NotificationSender> {
  if (sender) return sender;
  const configured =
    !!process.env.FCM_SERVICE_ACCOUNT || !!process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (configured) {
    const { FcmSender } = await import("./fcm");
    const fcm = FcmSender.tryCreate();
    if (fcm) {
      sender = fcm;
      return sender;
    }
    log.warn("FCM configured but unavailable; using stub sender");
  }
  sender = new StubSender();
  return sender;
}
