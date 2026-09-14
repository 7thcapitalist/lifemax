import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AttributeBar,
  CoinBalance,
  EmptyState,
  ErrorState,
  LoadingState,
  MissionCard,
  ProgressBar,
  QuestCard,
  Text,
} from "@/design-system";
import type { MissionView, QuestProgressView } from "@/lib/game-types";

const mission: MissionView = {
  id: "mission",
  localDate: "2026-09-12",
  title: "Call someone who matters",
  doneCondition: "Share ten present minutes",
  kind: "relationship",
  size: "small",
  status: "accepted",
  source: "generator",
  attributeIds: [],
  questId: null,
  chapterId: null,
  rationale: "Connection protects the life around the work.",
  version: 1,
};
const quest: QuestProgressView = {
  id: "quest",
  localDate: "2026-09-12",
  title: "Build a steady week",
  doneCondition: "Complete three missions",
  reason: "Practice consistency without streak pressure",
  size: "standard",
  source: "deterministic",
  status: "accepted",
  role: "main",
  milestoneId: null,
  progressCurrent: 1,
  progressTarget: 3,
  version: 1,
};

describe("LifeMax design system", () => {
  it("renders the typography scale and currency accessibly", () => {
    render(
      <>
        <Text as="h1" tone="display">
          Character
        </Text>
        <CoinBalance value={42} />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Character" })).toHaveClass(
      "text--display",
    );
    expect(screen.getByLabelText("42 coins")).toBeVisible();
  });
  it("exposes progress values", () => {
    render(<ProgressBar value={24} max={100} label="Resolve experience" />);
    expect(
      screen.getByRole("progressbar", { name: "Resolve experience" }),
    ).toHaveAttribute("aria-valuenow", "24");
  });
  it("renders a dynamic character attribute", () => {
    render(
      <AttributeBar
        attribute={{
          name: "Kinship",
          level: 2,
          xpIntoLevel: 12,
          xpForNextLevel: 50,
          emphasis: "active",
        }}
      />,
    );
    expect(screen.getByText("Kinship")).toBeVisible();
    expect(screen.getByText("LVL 2")).toBeVisible();
  });
  it("distinguishes support missions and explains their rationale", () => {
    render(<MissionCard mission={mission} />);
    expect(screen.getByText("relationship")).toBeVisible();
    expect(screen.getByText(/Connection protects/)).toBeVisible();
  });
  it("shows quest progress", () => {
    render(<QuestCard quest={quest} />);
    expect(
      screen.getByRole("progressbar", { name: /Build a steady week progress/ }),
    ).toHaveAttribute("aria-valuemax", "3");
  });
  it("renders distinct loading, empty and error states", () => {
    const { rerender } = render(<LoadingState label="Loading missions" />);
    expect(screen.getByLabelText("Loading missions")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    rerender(
      <EmptyState title="No missions" message="Choose your next move." />,
    );
    expect(screen.getByRole("heading", { name: "No missions" })).toBeVisible();
    rerender(<ErrorState message="API unavailable" />);
    expect(screen.getByRole("alert")).toHaveTextContent("API unavailable");
  });
});
