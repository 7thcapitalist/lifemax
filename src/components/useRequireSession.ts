"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BootstrapAuthed, BootstrapResponse } from "@/lib/types";

export function useRequireSession(options?: {
  requireOnboardingComplete?: boolean;
  requireOnboardingIncomplete?: boolean;
}) {
  const router = useRouter();
  const [boot, setBoot] = useState<BootstrapAuthed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<BootstrapResponse>("/api/v1/bootstrap");
        if (cancelled) return;
        if (!data.authenticated) {
          router.replace(data.hasOwner ? "/sign-in" : "/setup");
          return;
        }
        if (options?.requireOnboardingComplete && !data.owner.setupCompleted) {
          router.replace("/onboarding");
          return;
        }
        if (options?.requireOnboardingIncomplete && data.owner.setupCompleted) {
          router.replace("/today");
          return;
        }
        setBoot(data);
      } catch {
        if (!cancelled) setError("Could not load your session.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    options?.requireOnboardingComplete,
    options?.requireOnboardingIncomplete,
    router,
  ]);

  return { boot, error, setBoot };
}
