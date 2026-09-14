"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  Badge,
  CoinBalance,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenIntro,
} from "@/design-system";
import { ApiError, apiFetch } from "@/lib/api";
import type { RewardRedemptionView, RewardView } from "@/lib/game-types";
import type { CharacterResponse } from "@/lib/types";
import { useResource } from "@/lib/useResource";

export default function RewardsPage() {
  const { boot } = useRequireSession({ requireOnboardingComplete: true });
  const rewards = useResource<RewardView[]>(
    boot ? "/api/v1/rewards" : null,
    (items) => !items.filter((item) => item.status === "active").length,
  );
  const character = useResource<CharacterResponse>(
    boot ? "/api/v1/character" : null,
  );
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const visibleBalance =
    balance ??
    (character.resource.status === "ready"
      ? character.resource.data.wallet.coinBalance
      : 0);
  async function redeem(reward: RewardView) {
    setBusy(reward.id);
    setMessage("");
    try {
      const result = await apiFetch<RewardRedemptionView>(
        `/api/v1/rewards/${reward.id}/redeem`,
        {
          method: "POST",
          body: JSON.stringify({ localDate: boot?.localDate }),
        },
      );
      setBalance(result.coinBalance);
      setMessage(`${result.title} is yours. Enjoy it deliberately.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Reward could not be redeemed.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <AppShell showNav subtitle="Rewards shop">
      <main className="screen">
        <ScreenIntro
          eyebrow="Rewards"
          title="Spend what you earned"
          aside={<CoinBalance value={visibleBalance} />}
        >
          Turn progress into permission for something restorative or joyful.
        </ScreenIntro>
        {message ? (
          <div className="banner" role="status">
            {message}
          </div>
        ) : null}
        {rewards.resource.status === "loading" ? (
          <LoadingState label="Opening the rewards cabinet…" />
        ) : null}
        {rewards.resource.status === "error" ? (
          <ErrorState
            message={rewards.resource.message}
            retry={() => void rewards.reload()}
          />
        ) : null}
        {rewards.resource.status === "empty" ? (
          <EmptyState
            title="The cabinet is empty"
            message="Add personal rewards through the API for now; management UI stays outside this focused daily loop."
          />
        ) : null}
        {rewards.resource.status === "ready" ? (
          <section className="screen-grid screen-grid--two">
            {rewards.resource.data
              .filter((reward) => reward.status === "active")
              .map((reward) => (
                <article className="reward-card" key={reward.id}>
                  <div className="card-topline">
                    <Badge tone="exploration">Reward</Badge>
                    <CoinBalance value={reward.coinCost} />
                  </div>
                  <div>
                    <h2>{reward.title}</h2>
                    <p>{reward.description ?? "A reward chosen by you."}</p>
                  </div>
                  <button
                    className="btn-primary"
                    disabled={
                      busy === reward.id || visibleBalance < reward.coinCost
                    }
                    onClick={() => void redeem(reward)}
                  >
                    {busy === reward.id
                      ? "Redeeming…"
                      : visibleBalance < reward.coinCost
                        ? "Keep earning"
                        : "Redeem"}
                  </button>
                </article>
              ))}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
