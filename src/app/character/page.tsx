"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  AttributeBar,
  Badge,
  CoinBalance,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  ScreenIntro,
} from "@/design-system";
import type { CharacterResponse } from "@/lib/types";
import { useResource } from "@/lib/useResource";

export default function CharacterPage() {
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingComplete: true,
  });
  const { resource, reload } = useResource<CharacterResponse>(
    boot ? "/api/v1/character" : null,
    (data) => !data.attributes.length,
  );
  return (
    <AppShell showNav subtitle="Character state">
      <main className="screen">
        {sessionError ? <ErrorState message={sessionError} /> : null}
        {resource.status === "loading" ? (
          <LoadingState label="Loading character sheet…" />
        ) : null}
        {resource.status === "error" ? (
          <ErrorState message={resource.message} retry={() => void reload()} />
        ) : null}
        {resource.status === "empty" ? (
          <EmptyState
            title="Your attributes are waiting"
            message="Finish onboarding to give your character shape."
          />
        ) : null}
        {resource.status === "ready" ? (
          <>
            <ScreenIntro
              eyebrow="Character sheet"
              title="Who you are becoming"
              aside={<CoinBalance value={resource.data.wallet.coinBalance} />}
            >
              {resource.data.becomingStatement}
            </ScreenIntro>
            <section className="screen-grid" aria-labelledby="attributes-title">
              <div className="section-heading">
                <h2 id="attributes-title">Attributes</h2>
                <span className="meta">Earned through evidence</span>
              </div>
              {resource.data.attributes.map((attribute) => (
                <AttributeBar key={attribute.id} attribute={attribute} />
              ))}
            </section>
            {resource.data.activeQuest ? (
              <section className="premium-card stack-sm">
                <div className="card-topline">
                  <Badge tone="active">Active quest</Badge>
                  <Link href="/quests">Open quests</Link>
                </div>
                <h2>{resource.data.activeQuest.title}</h2>
                <ProgressBar
                  value={resource.data.activeQuest.progressCurrent}
                  max={resource.data.activeQuest.progressTarget}
                  label="Active quest progress"
                />
              </section>
            ) : null}
            <section className="guardrail-card">
              <Badge tone="rest">Guardrails</Badge>
              <h2>Protect the person playing</h2>
              {resource.data.guardrails.length ? (
                resource.data.guardrails.map((guardrail) => (
                  <p key={guardrail.id}>
                    <strong>{guardrail.category}:</strong> {guardrail.statement}
                  </p>
                ))
              ) : (
                <p>No guardrails defined yet.</p>
              )}
            </section>
            <section className="premium-card stack">
              <div className="card-topline">
                <div>
                  <Badge tone="exploration">Legacy</Badge>
                  <h2>Achievements</h2>
                </div>
                <strong>
                  {resource.data.achievements.unlocked} /{" "}
                  {resource.data.achievements.total}
                </strong>
              </div>
              <Link className="button btn-secondary" href="/achievements">
                View achievements
              </Link>
            </section>
            <section
              className="screen-grid screen-grid--two"
              aria-labelledby="aspects-title"
            >
              <h2 id="aspects-title" className="sr-only">
                Identity aspects
              </h2>
              {resource.data.aspects.map((aspect) => (
                <article className="premium-card stack-sm" key={aspect.id}>
                  <Badge tone={aspect.emphasis}>{aspect.emphasis}</Badge>
                  <h3>{aspect.name}</h3>
                  <p>{aspect.definition}</p>
                  <p className="meta">{aspect.desiredIdentity}</p>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
