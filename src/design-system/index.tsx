import React, { type ReactNode } from "react";
import Link from "next/link";
import type {
  ArcDayView,
  MissionProposal,
  MissionView,
  QuestProgressView,
} from "@/lib/game-types";

export function ArcHeader({
  day,
  total,
  streak,
}: {
  day: number;
  total: number;
  streak: number;
}) {
  const progress = Math.min(100, Math.max(0, (day / Math.max(1, total)) * 100));
  return (
    <section className="arc-header" aria-label={`Day ${day} of ${total}`}>
      <div className="arc-header__copy">
        <div className="arc-header__day">
          <span className="arc-header__prefix">Day</span>
          <strong>{day}</strong>
          <span className="arc-header__of">of {total}</span>
        </div>
        {streak > 0 ? (
          <div
            className="arc-header__streak"
            aria-label={`${streak} day streak`}
          >
            <strong>{streak}</strong>
            <span>days</span>
          </div>
        ) : null}
      </div>
      <div
        className="arc-header__track"
        role="progressbar"
        aria-label="Arc progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={day}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

const DAY_LABELS: Record<ArcDayView["status"], string> = {
  completed: "Completed",
  "deliberate-rest": "Deliberate rest",
  broken: "Broken",
  future: "Future",
};

export function MomentumGrid({ days }: { days: ArcDayView[] }) {
  return (
    <div className="momentum-grid" aria-label="Arc momentum by day">
      {days.map((day) => {
        const label = `Day ${day.dayNumber}, ${DAY_LABELS[day.status]}${day.isToday ? ", today" : ""}`;
        const className = `momentum-cell momentum-cell--${day.status}${day.isToday ? " momentum-cell--today" : ""}`;
        return day.status === "future" ? (
          <span key={day.localDate} className={className} aria-label={label}>
            {day.dayNumber}
          </span>
        ) : (
          <Link
            key={day.localDate}
            className={className}
            href={`/chronicle?date=${day.localDate}`}
            aria-label={label}
          >
            {day.dayNumber}
          </Link>
        );
      })}
    </div>
  );
}

export function MomentumLegend() {
  return (
    <ul className="momentum-legend" aria-label="Momentum grid legend">
      {(
        [
          ["completed", "Completed"],
          ["deliberate-rest", "Deliberate rest"],
          ["broken", "Broken"],
          ["future", "Future"],
          ["today", "Today"],
        ] as const
      ).map(([state, label]) => (
        <li key={state}>
          <span
            className={`legend-mark legend-mark--${state}`}
            aria-hidden="true"
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

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
