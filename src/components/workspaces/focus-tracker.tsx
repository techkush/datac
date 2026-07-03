"use client";

import * as React from "react";

// Logs focus time while this workspace tab is visible: a heartbeat every
// PING_MS, plus a beacon for the partial interval when the tab hides or
// closes. The server buckets seconds per local day (~/.datac/focus.json).
const PING_MS = 15_000;

export function FocusTracker({ ws }: { ws: string }) {
  React.useEffect(() => {
    const url = `/api/workspaces/${ws}/focus`;
    let last = Date.now();

    function flush(useBeacon: boolean) {
      const seconds = Math.round((Date.now() - last) / 1000);
      last = Date.now();
      if (seconds < 1) return;
      const body = JSON.stringify({ seconds });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          url,
          new Blob([body], { type: "application/json" }),
        );
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") flush(false);
      else last = Date.now(); // hidden: don't count this interval
    }, PING_MS);

    function onVisibility() {
      if (document.visibilityState === "hidden") flush(true);
      else last = Date.now();
    }
    function onPageHide() {
      if (document.visibilityState === "visible") flush(true);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [ws]);

  return null;
}
