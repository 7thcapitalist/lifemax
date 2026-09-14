"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  AttributeBar,
  Badge,
  CoinBalance,
  EmptyState,
  ErrorState,
  LoadingState,
  MissionCard,
  ScreenIntro,
} from "@/design-system";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  DailyPlanResponse,
  MissionCompletionResponse,
  MissionProposal,
  MissionView,
} from "@/lib/game-types";
import type { Capacity, CharacterResponse, TodayResponse } from "@/lib/types";

type TodayData = {
  today: TodayResponse;
  character: CharacterResponse;
  missions: MissionView[];
};
type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TodayData };

export default function TodayPage() {
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingComplete: true,
  });
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [proposals, setProposals] = useState<MissionProposal[]>([]);
  const [capacity, setCapacity] = useState<Capacity>("normal");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflection, setReflection] = useState("");

  const load = useCallback(async () => {
    if (!boot) return;
    setState({ status: "loading" });
    try {
      const [today, character, missions] = await Promise.all([
        apiFetch<TodayResponse>("/api/v1/today"),
        apiFetch<CharacterResponse>("/api/v1/character"),
        apiFetch<MissionView[]>(`/api/v1/missions?date=${boot.localDate}`),
      ]);
      setCapacity(today.checkIn?.capacity ?? "normal");
      setReflection(today.checkIn?.reflection ?? "");
      setState({ status: "ready", data: { today, character, missions } });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Today could not be loaded.",
      });
    }
  }, [boot]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCapacity() {
    if (!boot) return;
    setBusy("capacity");
    setNotice("");
    try {
      await apiFetch(`/api/v1/check-ins/${boot.localDate}`, {
        method: "PUT",
        body: JSON.stringify({ capacity, reflection: reflection || undefined }),
      });
      setNotice("Capacity set. Your plan can now meet you where you are.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Capacity could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }

  async function generatePlan() {
    if (!boot) return;
    setBusy("plan");
    setNotice("");
    try {
      const plan = await apiFetch<DailyPlanResponse>(
        "/api/v1/game-master/daily-plan",
        { method: "POST", body: JSON.stringify({ localDate: boot.localDate }) },
      );
      setProposals(plan.proposals);
      setNotice("A balanced plan is ready. You choose what enters your day.");
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "A daily plan could not be generated.",
      );
    } finally {
      setBusy("");
    }
  }

  async function acceptMission(proposal: MissionProposal) {
    if (!boot || state.status !== "ready") return;
    setBusy(proposal.title);
    setNotice("");
    try {
      const proposedMission = await apiFetch<MissionView>("/api/v1/missions", {
        method: "POST",
        body: JSON.stringify({
          localDate: boot.localDate,
          title: proposal.title,
          doneCondition: proposal.doneCondition,
          kind: proposal.kind,
          size: proposal.size,
          attributeIds: proposal.attributeIds,
          questId: proposal.questId,
          chapterId: proposal.chapterId,
        }),
      });
      const mission = await apiFetch<MissionView>(
        `/api/v1/missions/${proposedMission.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "accepted" }),
        },
      );
      setState({
        status: "ready",
        data: { ...state.data, missions: [...state.data.missions, mission] },
      });
      setProposals((items) =>
        items.filter((item) => item.title !== proposal.title),
      );
      setNotice(`“${mission.title}” joined today’s missions.`);
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Mission could not be accepted.",
      );
    } finally {
      setBusy("");
    }
  }

  async function completeMission(mission: MissionView) {
    if (state.status !== "ready") return;
    setBusy(mission.id);
    setNotice("");
    try {
      const result = await apiFetch<MissionCompletionResponse>(
        `/api/v1/missions/${mission.id}/complete`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const awards = new Map(
        result.xpAwards.map((award) => [award.attributeId, award]),
      );
      setState({
        status: "ready",
        data: {
          ...state.data,
          missions: state.data.missions.map((item) =>
            item.id === mission.id ? result.mission : item,
          ),
          character: {
            ...state.data.character,
            wallet: { coinBalance: result.coinBalance },
            attributes: state.data.character.attributes.map((attribute) => {
              const award = awards.get(attribute.id);
              return award
                ? {
                    ...attribute,
                    level: award.level,
                    xpIntoLevel: award.xpIntoLevel,
                  }
                : attribute;
            }),
          },
        },
      });
      setNotice(
        `Mission complete. +${result.coinAward} coins${result.xpAwards.length ? ` and ${result.xpAwards.reduce((sum, award) => sum + award.points, 0)} XP` : ""}.`,
      );
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Mission could not be completed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function saveReflection(event: FormEvent) {
    event.preventDefault();
    if (!boot) return;
    setBusy("reflection");
    try {
      await apiFetch(`/api/v1/check-ins/${boot.localDate}`, {
        method: "PUT",
        body: JSON.stringify({ capacity, reflection }),
      });
      setReflectionOpen(false);
      setNotice("Reflection saved to your private chronicle.");
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Reflection could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <AppShell
      showNav
      subtitle={boot?.localDate}
      action={
        state.status === "ready" ? (
          <CoinBalance value={state.data.character.wallet.coinBalance} />
        ) : undefined
      }
    >
      <main className="screen">
        {sessionError ? <ErrorState message={sessionError} /> : null}
        {state.status === "loading" ? (
          <LoadingState label="Preparing today’s field notes…" />
        ) : null}
        {state.status === "error" ? (
          <ErrorState message={state.message} retry={() => void load()} />
        ) : null}
        {state.status === "ready" ? (
          <>
            <ScreenIntro eyebrow="Today" title="Morning plan">
              A humane set of missions shaped by capacity, identity, and the
              life around you.
            </ScreenIntro>
            {notice ? (
              <div className="banner" role="status">
                {notice}
              </div>
            ) : null}
            {state.data.today.missedDayGap ? (
              <div className="banner">
                <strong>Welcome back.</strong>{" "}
                {state.data.today.missedDayGap.message}
              </div>
            ) : null}
            <section className="guardrail-card">
              <Badge tone="rest">Active guardrail</Badge>
              <h2>
                {state.data.character.guardrails[0]?.category ??
                  "Protect your capacity"}
              </h2>
              <p>
                {state.data.character.guardrails[0]?.statement ??
                  "Sustainable progress includes recovery, connection, and exploration."}
              </p>
            </section>
            {!state.data.today.checkIn ? (
              <section
                className="premium-card stack"
                aria-labelledby="capacity-title"
              >
                <div>
                  <Badge tone="maintenance">Step 1</Badge>
                  <h2 id="capacity-title">How much capacity is here?</h2>
                  <p>
                    The plan adapts without turning a low-energy day into a
                    failure.
                  </p>
                </div>
                <div className="capacity-options">
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
                <button
                  className="btn-primary"
                  disabled={busy === "capacity"}
                  onClick={() => void saveCapacity()}
                >
                  {busy === "capacity" ? "Saving…" : "Save capacity"}
                </button>
              </section>
            ) : (
              <>
                <section
                  className="screen-grid"
                  aria-labelledby="missions-title"
                >
                  <div className="section-heading">
                    <div>
                      <Badge tone="progress">Daily missions</Badge>
                      <h2 id="missions-title">Choose your next move</h2>
                    </div>
                    <button
                      className="btn-secondary"
                      disabled={busy === "plan"}
                      onClick={() => void generatePlan()}
                    >
                      {busy === "plan"
                        ? "Shaping…"
                        : proposals.length
                          ? "Refresh plan"
                          : "Generate plan"}
                    </button>
                  </div>
                  {!state.data.missions.length && !proposals.length ? (
                    <EmptyState
                      title="No missions chosen yet"
                      message="Generate a private, deterministic plan. It includes support missions when your guardrails or capacity call for them."
                    />
                  ) : null}
                  {proposals.map((proposal) => (
                    <MissionCard
                      key={`${proposal.rank}-${proposal.title}`}
                      mission={proposal}
                      action={
                        <button
                          className="btn-primary"
                          disabled={busy === proposal.title}
                          onClick={() => void acceptMission(proposal)}
                        >
                          {busy === proposal.title ? "Adding…" : "Add to today"}
                        </button>
                      }
                    />
                  ))}
                  {state.data.missions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      action={
                        mission.status === "completed" ? (
                          <Badge tone="completed">Complete</Badge>
                        ) : (
                          <button
                            className="btn-primary"
                            disabled={busy === mission.id}
                            onClick={() => void completeMission(mission)}
                          >
                            {busy === mission.id
                              ? "Recording…"
                              : "Complete mission"}
                          </button>
                        )
                      }
                    />
                  ))}
                </section>
                <section className="screen-grid" aria-labelledby="pulse-title">
                  <div className="section-heading">
                    <h2 id="pulse-title">Character pulse</h2>
                    <span className="meta">Updates after each mission</span>
                  </div>
                  {state.data.character.attributes
                    .slice(0, 3)
                    .map((attribute) => (
                      <AttributeBar key={attribute.id} attribute={attribute} />
                    ))}
                </section>
                <button
                  className="btn-ghost"
                  onClick={() => setReflectionOpen(true)}
                >
                  Close the day with a reflection
                </button>
              </>
            )}
          </>
        ) : null}
        {reflectionOpen ? (
          <div
            className="reflection-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget)
                setReflectionOpen(false);
            }}
          >
            <section
              className="reflection-sheet stack"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reflection-title"
            >
              <div>
                <Badge tone="rest">Evening reflection</Badge>
                <h2 id="reflection-title">What mattered today?</h2>
                <p>
                  Keep the meaning human. This stays in your private local
                  record.
                </p>
              </div>
              <form
                className="stack"
                onSubmit={(event) => void saveReflection(event)}
              >
                <div className="field">
                  <label htmlFor="reflection">Reflection</label>
                  <textarea
                    id="reflection"
                    required
                    maxLength={2000}
                    value={reflection}
                    onChange={(event) => setReflection(event.target.value)}
                    autoFocus
                  />
                </div>
                <div className="btn-row">
                  <button
                    className="btn-primary"
                    disabled={busy === "reflection"}
                  >
                    {busy === "reflection" ? "Saving…" : "Save reflection"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setReflectionOpen(false)}
                  >
                    Not now
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
