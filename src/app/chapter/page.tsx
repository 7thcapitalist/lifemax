"use client";

import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  ScreenIntro,
} from "@/design-system";
import type { ChapterProgressView } from "@/lib/game-types";
import type { ChroniclePage } from "@/lib/types";
import { useResource } from "@/lib/useResource";

export default function ChapterPage() {
  const { boot } = useRequireSession({ requireOnboardingComplete: true });
  const chapters = useResource<ChapterProgressView[]>(
    boot ? "/api/v1/chapters" : null,
    (items) => !items.length,
  );
  const chronicle = useResource<ChroniclePage>(
    boot ? "/api/v1/chronicle" : null,
  );
  return (
    <AppShell showNav subtitle="Season overview">
      <main className="screen">
        <ScreenIntro eyebrow="Current chapter" title="The season you are in">
          A bounded arc with room for ambition, recovery, and surprise.
        </ScreenIntro>
        {chapters.resource.status === "loading" ? (
          <LoadingState label="Opening your current chapter…" />
        ) : null}
        {chapters.resource.status === "error" ? (
          <ErrorState
            message={chapters.resource.message}
            retry={() => void chapters.reload()}
          />
        ) : null}
        {chapters.resource.status === "empty" ? (
          <EmptyState
            title="No active chapter"
            message="Your next season has not been named yet."
          />
        ) : null}
        {chapters.resource.status === "ready" ? (
          <section className="screen-grid">
            {chapters.resource.data.map((chapter) => (
              <article className="chapter-card stack" key={chapter.id}>
                <div className="card-topline">
                  <Badge tone={chapter.status}>{chapter.status}</Badge>
                  <span className="meta">
                    {chapter.startDate} — {chapter.endDate}
                  </span>
                </div>
                <div>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.intent}</p>
                </div>
                <ProgressBar
                  value={chapter.current}
                  max={chapter.target}
                  label={`${chapter.title} progress`}
                />
              </article>
            ))}
          </section>
        ) : null}
        <section className="screen-grid" aria-labelledby="chronicle-title">
          <div className="section-heading">
            <h2 id="chronicle-title">Recent chronicle</h2>
            <span className="meta">What actually happened</span>
          </div>
          {chronicle.resource.status === "loading" ? (
            <LoadingState label="Loading recent evidence…" />
          ) : null}
          {chronicle.resource.status === "error" ? (
            <ErrorState
              message={chronicle.resource.message}
              retry={() => void chronicle.reload()}
            />
          ) : null}
          {chronicle.resource.status === "ready" ||
          chronicle.resource.status === "empty" ? (
            chronicle.resource.data.items.length ? (
              chronicle.resource.data.items.slice(0, 5).map((item) => (
                <article className="premium-card stack-sm" key={item.id}>
                  <Badge tone={item.outcome}>{item.outcome}</Badge>
                  <h3>{item.questTitle}</h3>
                  <p>{item.reflection ?? "No reflection recorded."}</p>
                  <span className="meta">{item.localDate}</span>
                </article>
              ))
            ) : (
              <EmptyState
                title="Your chronicle is quiet"
                message="Completed and attempted quests will become the story of this chapter."
              />
            )
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
