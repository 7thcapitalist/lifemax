"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenIntro,
} from "@/design-system";
import type { ProgramSummaryView } from "@/lib/game-types";
import { useResource } from "@/lib/useResource";

function ProgramContent() {
  const searchParams = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const { boot, error: sessionError } = useRequireSession();
  const { resource, reload } = useResource<ProgramSummaryView>(
    boot ? `/api/v1/program-summary?date=${boot.localDate}` : null,
    (summary) => !summary.arc,
  );

  return (
    <AppShell showNav={!fromOnboarding} subtitle="Your program">
      <main className="screen">
        {sessionError ? <ErrorState message={sessionError} /> : null}
        {resource.status === "loading" ? (
          <LoadingState label="Generating your program…" />
        ) : null}
        {resource.status === "error" ? (
          <ErrorState message={resource.message} retry={() => void reload()} />
        ) : null}
        {resource.status === "empty" ? (
          <EmptyState
            title="Your program is taking shape"
            message="Name a chapter to give this program a bounded arc."
          />
        ) : null}
        {resource.status === "ready" ? (
          <>
            <ScreenIntro
              eyebrow="Your program"
              title={resource.data.arc!.title}
            >
              A clear shape for the days ahead, built from the character you
              defined.
            </ScreenIntro>
            <section className="program-card stack-sm">
              <p className="eyebrow">Aspects trained</p>
              <div className="program-aspects">
                {resource.data.aspectsTrained.map((aspect) => (
                  <Badge key={aspect.id} tone={aspect.emphasis}>
                    {aspect.name}
                  </Badge>
                ))}
              </div>
            </section>
            <section className="program-card stack-sm">
              <p className="eyebrow">Shape of a typical day</p>
              <h2>
                {resource.data.typicalDay.averageCompletedMissions.toFixed(1)}
                <span className="program-unit"> missions</span>
              </h2>
              <p>
                Based on {resource.data.typicalDay.sampleDays} days of your own
                evidence.
              </p>
              <dl className="program-breakdown">
                {Object.entries(resource.data.typicalDay.byKind).map(
                  ([kind, count]) => (
                    <div key={kind}>
                      <dt>{kind}</dt>
                      <dd>{count}</dd>
                    </div>
                  ),
                )}
              </dl>
            </section>
            <section className="program-card stack-sm">
              <p className="eyebrow">Arc length</p>
              <h2>{resource.data.arc!.lengthDays} days</h2>
              <p>Beginning {resource.data.arc!.startDate}.</p>
            </section>
            <section className="program-card stack-sm">
              <p className="eyebrow">First week</p>
              <ol className="program-rhythm">
                {resource.data.firstWeek.rhythm.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>
            <Link className="button btn-primary" href="/today">
              {fromOnboarding ? "Begin Day 1" : "Return to today"}
            </Link>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

export default function ProgramPage() {
  return (
    <Suspense>
      <ProgramContent />
    </Suspense>
  );
}
