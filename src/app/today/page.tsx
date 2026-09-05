"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner, LiveRegion, StatusBanner } from "@/components/Feedback";
import { useRequireSession } from "@/components/useRequireSession";
import { ApiError, apiFetch, clearCsrfToken } from "@/lib/api";
import type { Capacity, QuestView, TodayResponse } from "@/lib/types";

type Phase = "resolve" | "capacity" | "briefing" | "quests" | "done";

export default function TodayPage() {
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingComplete: true,
  });
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [capacity, setCapacity] = useState<Capacity>("normal");
  const [doneForNow, setDoneForNow] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDone, setDraftDone] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDone, setEditDone] = useState("");
  const [editReason, setEditReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    const data = await apiFetch<TodayResponse>("/api/v1/today");
    setToday(data);
    setLoadFailed(false);
    if (data.checkIn) setCapacity(data.checkIn.capacity);
    return data;
  }, []);

  useEffect(() => {
    if (!boot) return;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        setLoadFailed(true);
        if (err instanceof ApiError) setError(err.message);
        else setError("Could not load Today.");
      }
    })();
  }, [boot, refresh]);

  const phase: Phase = useMemo(() => {
    if (!today) return "resolve";
    if (today.unresolvedPriorQuests.length > 0) return "resolve";
    if (!today.checkIn) return "capacity";
    if (!today.briefing) return "briefing";
    if (doneForNow) return "done";
    return "quests";
  }, [doneForNow, today]);

  async function resolveQuest(
    quest: QuestView,
    outcome: "completed" | "attempted" | "dropped",
  ) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/quests/${quest.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });
      setStatus(`Marked “${quest.title}” as ${outcome}.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not resolve quest.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCapacity() {
    if (!today) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/check-ins/${today.localDate}`, {
        method: "PUT",
        body: JSON.stringify({ capacity }),
      });
      setStatus("Capacity saved.");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not save capacity.");
    } finally {
      setBusy(false);
    }
  }

  async function generateBriefing() {
    if (!today) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/briefings/${today.localDate}/generate`, {
        method: "POST",
      });
      setStatus("Private deterministic briefing ready.");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not generate briefing.");
    } finally {
      setBusy(false);
    }
  }

  async function createQuest() {
    if (!today) return;
    setBusy(true);
    setError(null);
    try {
      const character = await apiFetch<{
        aspects: Array<{ id: string; emphasis: string }>;
      }>("/api/v1/character");
      const aspectId = character.aspects.find(
        (aspect) => aspect.emphasis !== "dormant",
      )?.id;
      if (!aspectId) {
        setError("Add an active aspect before proposing a quest.");
        return;
      }
      await apiFetch("/api/v1/quests", {
        method: "POST",
        body: JSON.stringify({
          localDate: today.localDate,
          title: draftTitle,
          doneCondition: draftDone,
          reason: draftReason,
          size: "standard",
          aspectIds: [aspectId],
        }),
      });
      setDraftTitle("");
      setDraftDone("");
      setDraftReason("");
      setStatus("Quest proposed.");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not create quest.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptQuest(quest: QuestView, role: "main" | "side") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/quests/${quest.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setStatus(`Accepted “${quest.title}” as ${role}.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not accept quest.");
    } finally {
      setBusy(false);
    }
  }

  async function declineQuest(quest: QuestView) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/quests/${quest.id}/decline`, {
        method: "POST",
      });
      setStatus(`Declined “${quest.title}”.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not decline quest.");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(quest: QuestView) {
    setEditingId(quest.id);
    setEditTitle(quest.title);
    setEditDone(quest.doneCondition);
    setEditReason(quest.reason);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDone("");
    setEditReason("");
  }

  async function saveEdit(quest: QuestView) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/quests/${quest.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle,
          doneCondition: editDone,
          reason: editReason,
        }),
      });
      setStatus(`Updated “${editTitle.trim() || quest.title}”.`);
      cancelEdit();
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not edit quest.");
    } finally {
      setBusy(false);
    }
  }

  async function swapQuest(accepted: QuestView, replacement: QuestView) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/quests/${accepted.id}/swap`, {
        method: "POST",
        body: JSON.stringify({
          replacementQuestId: replacement.id,
          role: accepted.role ?? "main",
        }),
      });
      setStatus(`Swapped in “${replacement.title}”.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not swap quest.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await apiFetch("/api/v1/auth/session", { method: "DELETE" });
    } finally {
      clearCsrfToken();
      window.location.href = "/sign-in";
    }
  }

  if (!boot || !today) {
    return (
      <AppShell showNav>
        <main className="panel stack">
          <ErrorBanner message={error ?? sessionError} />
          {loadFailed ? (
            <div className="btn-row">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setLoadFailed(false);
                  setError(null);
                  void refresh().catch((err) => {
                    setLoadFailed(true);
                    if (err instanceof ApiError) setError(err.message);
                    else setError("Could not load Today.");
                  });
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <LiveRegion message="Loading Today…" />
          )}
        </main>
      </AppShell>
    );
  }

  const proposed = today.quests.filter((quest) => quest.status === "proposed");
  const accepted = today.quests.filter((quest) => quest.status === "accepted");
  const suggestedIds = new Set(
    today.briefing?.suggestions
      .map((item) => item.questId)
      .filter((id): id is string => Boolean(id)) ?? [],
  );
  const hasMain = accepted.some((item) => item.role === "main");

  return (
    <AppShell
      showNav
      subtitle={today.localDate}
      action={
        <button
          type="button"
          className="btn-quiet"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      }
    >
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">Today</p>
          <h1>Morning plan</h1>
          <p>
            Resolve what remains, set capacity, review the private briefing,
            then accept a small set of quests.
          </p>
        </div>

        {today.missedDayGap ? (
          <StatusBanner>{today.missedDayGap.message}</StatusBanner>
        ) : null}

        <ErrorBanner message={error ?? sessionError} />
        <LiveRegion message={status} />

        {phase === "resolve" ? (
          <section className="stack" aria-labelledby="resolve-heading">
            <h2 id="resolve-heading">Resolve prior quests</h2>
            <p>One choice each. No score is lost for attempt or drop.</p>
            <ol className="step-list">
              {today.unresolvedPriorQuests.map((quest) => (
                <li key={quest.id} className="stack-sm">
                  <strong>{quest.title}</strong>
                  <p className="meta">
                    From {quest.localDate} · {quest.doneCondition}
                  </p>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => void resolveQuest(quest, "completed")}
                    >
                      Completed
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void resolveQuest(quest, "attempted")}
                    >
                      Attempted
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => void resolveQuest(quest, "dropped")}
                    >
                      Dropped
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {phase === "capacity" ? (
          <section className="stack" aria-labelledby="capacity-heading">
            <h2 id="capacity-heading">How much capacity do you have?</h2>
            <div
              className="capacity-options"
              role="radiogroup"
              aria-label="Capacity"
            >
              {(["low", "normal", "high"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="capacity"
                    value={value}
                    checked={capacity === value}
                    onChange={() => setCapacity(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void saveCapacity()}
              >
                Save capacity
              </button>
            </div>
          </section>
        ) : null}

        {phase === "briefing" ? (
          <section className="stack" aria-labelledby="briefing-heading">
            <h2 id="briefing-heading">Morning briefing</h2>
            <p>
              Deterministic and private. No external model is used for this
              delivery.
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void generateBriefing()}
              >
                Generate briefing
              </button>
            </div>
          </section>
        ) : null}

        {phase === "quests" || phase === "done" ? (
          <section className="stack" aria-labelledby="quests-heading">
            <h2 id="quests-heading">
              {phase === "done"
                ? "Today’s accepted quests"
                : "Shape today’s quests"}
            </h2>
            {today.briefing ? (
              <StatusBanner>
                <strong>Mirror:</strong> {today.briefing.mirror}
              </StatusBanner>
            ) : null}

            {accepted.length > 0 ? (
              <div>
                {accepted.map((quest) => (
                  <article key={quest.id} className="quest-card stack-sm">
                    <p className="emphasis">{quest.role ?? "quest"}</p>
                    <h3>{quest.title}</h3>
                    <p>{quest.doneCondition}</p>
                    <p className="meta">{quest.reason}</p>
                    {phase === "quests" && proposed[0] ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => void swapQuest(quest, proposed[0]!)}
                      >
                        Swap with “{proposed[0].title}”
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}

            {phase === "quests" ? (
              <>
                <div>
                  <h3>Proposed</h3>
                  {proposed.length === 0 ? (
                    <p className="meta">No proposals yet. Author one below.</p>
                  ) : (
                    proposed.map((quest) => (
                      <article key={quest.id} className="quest-card stack-sm">
                        {editingId === quest.id ? (
                          <>
                            <div className="field">
                              <label htmlFor={`edit-title-${quest.id}`}>
                                Title
                              </label>
                              <input
                                id={`edit-title-${quest.id}`}
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                maxLength={200}
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`edit-done-${quest.id}`}>
                                Done condition
                              </label>
                              <input
                                id={`edit-done-${quest.id}`}
                                value={editDone}
                                onChange={(e) => setEditDone(e.target.value)}
                                maxLength={1000}
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`edit-reason-${quest.id}`}>
                                Reason
                              </label>
                              <input
                                id={`edit-reason-${quest.id}`}
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                maxLength={1000}
                              />
                            </div>
                            <div className="btn-row">
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={
                                  busy ||
                                  !editTitle.trim() ||
                                  !editDone.trim() ||
                                  !editReason.trim()
                                }
                                onClick={() => void saveEdit(quest)}
                              >
                                Save edits
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                disabled={busy}
                                onClick={cancelEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <h3>{quest.title}</h3>
                            <p>{quest.doneCondition}</p>
                            <p className="meta">{quest.reason}</p>
                            {suggestedIds.has(quest.id) ? (
                              <p className="emphasis">Suggested in briefing</p>
                            ) : null}
                            <div className="btn-row">
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={busy || hasMain}
                                onClick={() => void acceptQuest(quest, "main")}
                              >
                                Accept main
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy || accepted.length >= 3}
                                onClick={() => void acceptQuest(quest, "side")}
                              >
                                Accept side
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => beginEdit(quest)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                disabled={busy}
                                onClick={() => void declineQuest(quest)}
                              >
                                Decline
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))
                  )}
                </div>

                <div className="stack">
                  <h3>Propose a quest</h3>
                  <div className="field">
                    <label htmlFor="quest-title">Title</label>
                    <input
                      id="quest-title"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="quest-done">Done condition</label>
                    <input
                      id="quest-done"
                      value={draftDone}
                      onChange={(e) => setDraftDone(e.target.value)}
                      maxLength={1000}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="quest-reason">Reason</label>
                    <input
                      id="quest-reason"
                      value={draftReason}
                      onChange={(e) => setDraftReason(e.target.value)}
                      maxLength={1000}
                    />
                  </div>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={
                        busy ||
                        !draftTitle.trim() ||
                        !draftDone.trim() ||
                        !draftReason.trim()
                      }
                      onClick={() => void createQuest()}
                    >
                      Propose quest
                    </button>
                    {accepted.length > 0 ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setDoneForNow(true)}
                      >
                        Done for now
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p>Leave the app and live the day. Come back tomorrow morning.</p>
            )}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
