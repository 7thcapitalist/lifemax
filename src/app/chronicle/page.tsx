"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner, LiveRegion } from "@/components/Feedback";
import { useRequireSession } from "@/components/useRequireSession";
import { ApiError, apiFetch } from "@/lib/api";
import type { ChroniclePage } from "@/lib/types";

export default function ChroniclePage() {
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingComplete: true,
  });
  const [page, setPage] = useState<ChroniclePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!boot) return;
    void (async () => {
      try {
        setPage(await apiFetch<ChroniclePage>("/api/v1/chronicle"));
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError("Could not load Chronicle.");
      }
    })();
  }, [boot]);

  async function loadMore() {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await apiFetch<ChroniclePage>(
        `/api/v1/chronicle?cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setPage({
        items: [...page.items, ...next.items],
        nextCursor: next.nextCursor,
      });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not load more chronicle entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (!boot || !page) {
    return (
      <AppShell showNav>
        <main className="panel stack">
          <ErrorBanner message={error ?? sessionError} />
          <LiveRegion
            message={error ? "Chronicle failed to load." : "Loading Chronicle…"}
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell showNav subtitle="Evidence over time">
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">Chronicle</p>
          <h1>Outcomes and reflections</h1>
          <p>A chronological record — not a scoreboard.</p>
        </div>
        <ErrorBanner message={error ?? sessionError} />
        {page.items.length === 0 ? (
          <p className="meta">No outcomes yet. Resolve a quest to begin.</p>
        ) : (
          page.items.map((item) => (
            <article key={item.id} className="outcome-card stack-sm">
              <p className="emphasis">
                {item.outcome} · {item.localDate}
              </p>
              <h2>{item.questTitle}</h2>
              {item.reflection ? <p>{item.reflection}</p> : null}
              <p className="meta">
                {new Date(item.occurredAt).toLocaleString()}
              </p>
            </article>
          ))
        )}
        {page.nextCursor ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
