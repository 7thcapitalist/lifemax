import type { Domain, Quest } from "@/lib/model";

export const player = {
  name: "Player One",
  level: 28,
  xp: 6840,
  nextLevelXp: 7500,
  identity: "Founder · Athlete · Scholar · Explorer",
};

export const domains: Domain[] = [
  { key: "builder", name: "Builder", icon: "↗", level: 31, trend: "up", focus: "Ship the first AI product" },
  { key: "body", name: "Body", icon: "◆", level: 27, trend: "up", focus: "Strength + consistency" },
  { key: "knowledge", name: "Knowledge", icon: "◎", level: 38, trend: "up", focus: "AI + financial economics" },
  { key: "academics", name: "Academics", icon: "A", level: 34, trend: "flat", focus: "Strong semester execution" },
  { key: "capital", name: "Capital", icon: "$", level: 19, trend: "up", focus: "Build optionality" },
  { key: "relationships", name: "Relationships", icon: "♡", level: 24, trend: "down", focus: "Protect important people" },
  { key: "adventure", name: "Life Lived", icon: "✦", level: 29, trend: "flat", focus: "One memorable thing each week" },
  { key: "recovery", name: "Recovery", icon: "☾", level: 22, trend: "down", focus: "Sleep before optimization" },
];

export const quests: Quest[] = [
  { id: "q1", domain: "builder", title: "Ship LifeMax v0 dashboard", progress: 68, status: "active" },
  { id: "q2", domain: "body", title: "Train 4× this week", progress: 50, unit: "2 / 4", status: "active" },
  { id: "q3", domain: "academics", title: "Finish finance problem set", progress: 80, status: "active" },
  { id: "q4", domain: "relationships", title: "Make time for one real dinner", progress: 0, status: "at-risk" },
  { id: "q5", domain: "adventure", title: "Do something new this weekend", progress: 0, status: "active" },
];
