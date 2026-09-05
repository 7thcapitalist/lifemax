"use client";

import type { ReactNode } from "react";

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="banner banner--error" role="alert">
      {message}
    </div>
  );
}

export function StatusBanner({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn";
}) {
  return (
    <div
      className={tone === "warn" ? "banner banner--warn" : "banner"}
      role="status"
    >
      {children}
    </div>
  );
}

export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="live-region meta" aria-live="polite">
      {message}
    </p>
  );
}
