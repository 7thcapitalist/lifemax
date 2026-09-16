"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  ArcHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  MomentumGrid,
  MomentumLegend,
  ScreenIntro,
} from "@/design-system";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  ArcDayView,
  ProgramSummaryView,
  StreakView,
} from "@/lib/game-types";

type MomentumData = {
  program: ProgramSummaryView;
  streak: StreakView;
  days: ArcDayView[];
};

export default function MomentumPage() {
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingComplete: true,
  });
  const [data, setData] = useState<MomentumData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!boot) return;
    setError("");
    try {
      const suffix = `?date=${boot.localDate}`;
      const [program, streak, days] = await Promise.all([
        apiFetch<ProgramSummaryView>(`/api/v1/program-summary${suffix}`),
        apiFetch<StreakView>(`/api/v1/streak${suffix}`),
        apiFetch<ArcDayView[]>(`/api/v1/arc-days${suffix}`),
      ]);
      setData({ program, streak, days });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Momentum could not be loaded.",
      );
    }
  }, [boot]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell showNav subtitle="Arc momentum">
      <main className="screen">
        {sessionError ? <ErrorState message={sessionError} /> : null}
        {!data && !error ? <LoadingState label="Mapping your arc…" /> : null}
        {error ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : null}
        {data && (!data.program.arc || !data.days.length) ? (
          <EmptyState
            title="No active arc yet"
            message="Your next season has not been named yet."
          />
        ) : null}
        {data?.program.arc && data.days.length ? (
          <>
            <ArcHeader
              day={data.program.arc.dayCounter.day}
              total={data.program.arc.dayCounter.of}
              streak={data.streak.current}
            />
            <ScreenIntro eyebrow="Momentum" title="The shape of this arc">
              Each day is evidence: progress, deliberate rest, or room to begin
              again.
            </ScreenIntro>
            <section
              className="momentum-panel"
              aria-labelledby="momentum-title"
            >
              <h2 id="momentum-title" className="sr-only">
                Daily momentum
              </h2>
              <MomentumGrid days={data.days} />
              <MomentumLegend />
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
