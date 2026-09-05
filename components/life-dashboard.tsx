"use client";

import { useMemo, useState } from "react";
import { domains, player, quests as initialQuests } from "@/data/mock";
import type { Quest } from "@/lib/model";

const trendMark = { up: "↑", flat: "→", down: "↓" } as const;

export function LifeDashboard() {
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const [view, setView] = useState<"today" | "week">("week");

  const completed = useMemo(() => quests.filter((q) => q.status === "done").length, [quests]);

  function completeQuest(id: string) {
    setQuests((current) =>
      current.map((quest) =>
        quest.id === id ? { ...quest, progress: 100, status: "done" as const } : quest,
      ),
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">LIFEMAX // CHARACTER OS</div>
          <h1>Play your life.</h1>
        </div>
        <div className="view-toggle" aria-label="Dashboard range">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>Today</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
        </div>
      </header>

      <section className="hero-grid">
        <article className="player-card panel">
          <div className="player-orb">{player.level}</div>
          <div>
            <span className="muted">PLAYER</span>
            <h2>{player.name}</h2>
            <p>{player.identity}</p>
            <div className="xp-line">
              <span>Level {player.level}</span>
              <span>{player.xp.toLocaleString()} / {player.nextLevelXp.toLocaleString()} XP</span>
            </div>
            <div className="progress"><span style={{ width: `${(player.xp / player.nextLevelXp) * 100}%` }} /></div>
          </div>
        </article>

        <article className="warning panel">
          <div className="warning-mark">!</div>
          <div>
            <span className="muted">BALANCE SIGNAL</span>
            <h3>Builder overload</h3>
            <p>Your output is climbing while Relationships and Recovery are trending down. Maxing one stat should not break the character.</p>
          </div>
        </article>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <span className="muted">CHARACTER BUILD</span>
            <h2>Your stats</h2>
          </div>
          <span className="tiny">Not a score. A build.</span>
        </div>
        <div className="stats-grid">
          {domains.map((domain) => (
            <article className="stat panel" key={domain.key}>
              <div className="stat-top"><span className="icon">{domain.icon}</span><span className={`trend ${domain.trend}`}>{trendMark[domain.trend]}</span></div>
              <div className="level">{domain.level}</div>
              <h3>{domain.name}</h3>
              <p>{domain.focus}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="quest-section">
        <div className="section-heading">
          <div>
            <span className="muted">{view === "today" ? "TODAY'S QUESTS" : "WEEKLY QUESTS"}</span>
            <h2>Main quests</h2>
          </div>
          <span className="tiny">{completed}/{quests.length} complete</span>
        </div>
        <div className="quests panel">
          {quests.map((quest) => {
            const domain = domains.find((item) => item.key === quest.domain);
            return (
              <div className={`quest ${quest.status}`} key={quest.id}>
                <div className="quest-icon">{domain?.icon}</div>
                <div className="quest-main">
                  <div className="quest-title-row"><strong>{quest.title}</strong><span>{quest.unit ?? `${quest.progress}%`}</span></div>
                  <div className="progress"><span style={{ width: `${quest.progress}%` }} /></div>
                </div>
                <button onClick={() => completeQuest(quest.id)} disabled={quest.status === "done"}>
                  {quest.status === "done" ? "Done" : "Complete"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="reflection-grid">
        <article className="panel reflection">
          <span className="muted">GAME MASTER</span>
          <h2>Weekly reflection</h2>
          <p>You are progressing fast in Builder and Knowledge. The next useful move is not more work—it is protecting recovery and making room for a memorable experience.</p>
          <div className="prompt">“What would make this week feel well-lived, not merely productive?”</div>
        </article>
        <article className="panel sidequest">
          <span className="muted">SIDE QUEST</span>
          <div className="sidequest-glyph">✦</div>
          <h2>Leave the map</h2>
          <p>Do one thing this weekend you could not have predicted on Monday.</p>
          <span className="reward">+250 Life Lived XP</span>
        </article>
      </section>
    </main>
  );
}
