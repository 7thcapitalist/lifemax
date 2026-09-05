"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner, LiveRegion } from "@/components/Feedback";
import { useRequireSession } from "@/components/useRequireSession";
import { ApiError, apiFetch } from "@/lib/api";
import type { CharacterResponse } from "@/lib/types";

export default function CharacterPage() {
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingComplete: true,
  });
  const [character, setCharacter] = useState<CharacterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!boot) return;
    void (async () => {
      try {
        setCharacter(await apiFetch<CharacterResponse>("/api/v1/character"));
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError("Could not load Character.");
      }
    })();
  }, [boot]);

  if (!boot || !character) {
    return (
      <AppShell showNav>
        <main className="panel">
          <ErrorBanner message={error ?? sessionError} />
          <LiveRegion message="Loading Character…" />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell showNav subtitle="Identity">
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">Character</p>
          <h1>Who you are becoming</h1>
          <p>{character.becomingStatement}</p>
        </div>
        <ErrorBanner message={error ?? sessionError} />

        <section aria-labelledby="aspects-heading" className="stack">
          <h2 id="aspects-heading">Aspects</h2>
          {character.aspects.map((aspect) => (
            <article key={aspect.id} className="aspect-card stack-sm">
              <p className="emphasis">{aspect.emphasis}</p>
              <h3>{aspect.name}</h3>
              <p>{aspect.definition}</p>
              <p className="meta">Desired: {aspect.desiredIdentity}</p>
            </article>
          ))}
        </section>

        <section aria-labelledby="stars-heading" className="stack">
          <h2 id="stars-heading">North Stars</h2>
          {character.northStars.length === 0 ? (
            <p className="meta">No North Stars yet.</p>
          ) : (
            character.northStars.map((star) => (
              <article key={star.id} className="aspect-card stack-sm">
                <h3>{star.title}</h3>
                <p>{star.motivation}</p>
              </article>
            ))
          )}
        </section>

        <section aria-labelledby="chapter-heading" className="stack">
          <h2 id="chapter-heading">Chapter</h2>
          {character.activeChapter ? (
            <>
              <h3>{character.activeChapter.title}</h3>
              <p>{character.activeChapter.intent}</p>
              <p className="meta">
                {character.activeChapter.startDate} →{" "}
                {character.activeChapter.endDate}
              </p>
              {character.activeChapter.milestones.map((milestone) => (
                <article key={milestone.id} className="aspect-card stack-sm">
                  <h3>{milestone.title}</h3>
                  <p>{milestone.doneCondition}</p>
                  <p className="meta">{milestone.status}</p>
                </article>
              ))}
            </>
          ) : (
            <p className="meta">No active chapter.</p>
          )}
        </section>

        <section aria-labelledby="guardrails-heading" className="stack">
          <h2 id="guardrails-heading">Guardrails</h2>
          {character.guardrails.map((guardrail) => (
            <article key={guardrail.id} className="aspect-card stack-sm">
              <p className="emphasis">{guardrail.category}</p>
              <p>{guardrail.statement}</p>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
