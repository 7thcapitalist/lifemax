"use client";

import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenIntro,
} from "@/design-system";
import type { AchievementView } from "@/lib/game-types";
import { useResource } from "@/lib/useResource";

export default function AchievementsPage() {
  const { boot } = useRequireSession({ requireOnboardingComplete: true });
  const { resource, reload } = useResource<AchievementView[]>(
    boot ? "/api/v1/achievements" : null,
    (items) => !items.length,
  );
  return (
    <AppShell showNav subtitle="Character legacy">
      <main className="screen">
        <ScreenIntro eyebrow="Achievements" title="Proof of becoming">
          Milestones emerge from patterns you lived, not boxes you chased.
        </ScreenIntro>
        {resource.status === "loading" ? (
          <LoadingState label="Reviewing your legacy…" />
        ) : null}
        {resource.status === "error" ? (
          <ErrorState message={resource.message} retry={() => void reload()} />
        ) : null}
        {resource.status === "empty" ? (
          <EmptyState
            title="No achievements defined"
            message="Your first achievement will appear as the game learns from completed missions."
          />
        ) : null}
        {resource.status === "ready" ? (
          <section className="screen-grid">
            {resource.data.map((achievement) => (
              <article
                className="achievement-card"
                data-unlocked={Boolean(achievement.unlockedAt)}
                key={achievement.key}
              >
                <span className="achievement-mark" aria-hidden="true">
                  {achievement.unlockedAt ? "✦" : "◇"}
                </span>
                <div>
                  <Badge
                    tone={achievement.unlockedAt ? "exploration" : "locked"}
                  >
                    {achievement.unlockedAt ? "Unlocked" : "Undiscovered"}
                  </Badge>
                  <h2>{achievement.title}</h2>
                  <p>{achievement.description}</p>
                  {achievement.unlockedAt ? (
                    <p className="meta">
                      Unlocked{" "}
                      {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
