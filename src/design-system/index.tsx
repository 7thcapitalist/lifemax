import React, { type ReactNode } from "react";
import type {
  MissionProposal,
  MissionView,
  QuestProgressView,
} from "@/lib/game-types";

export function Text({
  as: Tag = "p",
  tone = "body",
  children,
}: {
  as?: "p" | "span" | "h1" | "h2" | "h3";
  tone?: "display" | "heading" | "body" | "caption";
  children: ReactNode;
}) {
  return <Tag className={`text text--${tone}`}>{children}</Tag>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  return (
    <div className="progress-wrap">
      <div className="progress-copy">
        <span>{label}</span>
        <span>
          {safeValue}/{safeMax}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
      >
        <span style={{ width: `${(safeValue / safeMax) * 100}%` }} />
      </div>
    </div>
  );
}

export function AttributeBar({
  attribute,
}: {
  attribute: {
    name: string;
    level: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
    emphasis: string;
  };
}) {
  return (
    <article className="attribute-card" data-testid="attribute-bar">
      <div className="attribute-heading">
        <div>
          <Badge tone={attribute.emphasis}>{attribute.emphasis}</Badge>
          <h3>{attribute.name}</h3>
        </div>
        <strong>LVL {attribute.level}</strong>
      </div>
      <ProgressBar
        value={attribute.xpIntoLevel}
        max={attribute.xpForNextLevel}
        label={`${attribute.name} experience`}
      />
    </article>
  );
}

export function MissionCard({
  mission,
  action,
}: {
  mission: MissionView | MissionProposal;
  action?: ReactNode;
}) {
  return (
    <article className={`mission-card mission-card--${mission.kind}`}>
      <div className="card-topline">
        <Badge tone={mission.kind}>{mission.kind}</Badge>
        <Badge>{mission.size}</Badge>
      </div>
      <h3>{mission.title}</h3>
      <p>{mission.doneCondition}</p>
      {mission.rationale ? (
        <p className="rationale">
          <span aria-hidden="true">↳</span> {mission.rationale}
        </p>
      ) : null}
      {action ? <div className="card-action">{action}</div> : null}
    </article>
  );
}

export function QuestCard({
  quest,
  action,
}: {
  quest: QuestProgressView;
  action?: ReactNode;
}) {
  return (
    <article className="quest-card premium-card">
      <div className="card-topline">
        <Badge tone={quest.status}>{quest.status}</Badge>
        {quest.role ? <Badge>{quest.role}</Badge> : null}
      </div>
      <h3>{quest.title}</h3>
      <p>{quest.reason}</p>
      <ProgressBar
        value={quest.progressCurrent}
        max={quest.progressTarget}
        label={`${quest.title} progress`}
      />
      {action}
    </article>
  );
}

export function CoinBalance({ value }: { value: number }) {
  return (
    <span className="coin-balance" aria-label={`${value} coins`}>
      <span aria-hidden="true">◆</span> {value}
    </span>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <section className="state-card" aria-busy="true" aria-label={label}>
      <span className="state-orb" />
      <div>
        <h2>Gathering your world</h2>
        <p>{label}</p>
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className="state-card state-card--empty">
      <span className="state-glyph" aria-hidden="true">
        ◇
      </span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action}
      </div>
    </section>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <section className="state-card state-card--error" role="alert">
      <span className="state-glyph" aria-hidden="true">
        !
      </span>
      <div>
        <h2>The path is temporarily obscured</h2>
        <p>{message}</p>
        {retry ? (
          <button className="btn-secondary" onClick={retry}>
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ScreenIntro({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="screen-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {aside}
    </header>
  );
}
