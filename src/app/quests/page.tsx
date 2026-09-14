"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  QuestCard,
  ScreenIntro,
} from "@/design-system";
import { ApiError, apiFetch } from "@/lib/api";
import type { QuestProgressView } from "@/lib/game-types";
import { useResource } from "@/lib/useResource";

export default function QuestsPage() {
  const { boot } = useRequireSession({ requireOnboardingComplete: true });
  const [mutationError, setMutationError] = useState("");
  const { resource, reload } = useResource<QuestProgressView[]>(
    boot ? `/api/v1/quests?date=${boot.localDate}` : null,
    (items) => !items.length,
  );
  async function act(
    quest: QuestProgressView,
    action: "accept" | "decline" | "resolve",
  ) {
    setMutationError("");
    try {
      await apiFetch(`/api/v1/quests/${quest.id}/${action}`, {
        method: "POST",
        body:
          action === "accept"
            ? JSON.stringify({ role: "main" })
            : action === "resolve"
              ? JSON.stringify({ outcome: "completed" })
              : undefined,
      });
      await reload();
    } catch (error) {
      setMutationError(
        error instanceof ApiError ? error.message : "Quest action failed.",
      );
    }
  }
  return (
    <AppShell showNav subtitle="Weekly arc">
      <main className="screen">
        <ScreenIntro eyebrow="Quest log" title="Quests">
          Commit to a few meaningful arcs. Progress is evidence, not judgment.
        </ScreenIntro>
        {mutationError ? <ErrorState message={mutationError} /> : null}
        {resource.status === "loading" ? (
          <LoadingState label="Reading the quest log…" />
        ) : null}
        {resource.status === "error" ? (
          <ErrorState message={resource.message} retry={() => void reload()} />
        ) : null}
        {resource.status === "empty" ? (
          <EmptyState
            title="No quests for this day"
            message="Your daily missions can still move your character forward. New quests appear when you choose a longer arc."
          />
        ) : null}
        {resource.status === "ready" ? (
          <section className="screen-grid">
            {resource.data.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                action={
                  <div className="btn-row">
                    {quest.status === "proposed" ? (
                      <>
                        <button
                          className="btn-primary"
                          onClick={() => void act(quest, "accept")}
                        >
                          Accept quest
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => void act(quest, "decline")}
                        >
                          Pass
                        </button>
                      </>
                    ) : null}
                    {quest.status === "accepted" ? (
                      <button
                        className="btn-primary"
                        onClick={() => void act(quest, "resolve")}
                      >
                        Mark complete
                      </button>
                    ) : null}
                  </div>
                }
              />
            ))}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
