import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AttributeBar,
  ArcHeader,
  CoinBalance,
  EmptyState,
  ErrorState,
  LoadingState,
  MissionCard,
  MomentumGrid,
  MomentumLegend,
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
  it("renders the arc header and omits a zero streak", () => {
    const { rerender } = render(<ArcHeader day={23} total={66} streak={0} />);
    expect(screen.getByLabelText("Day 23 of 66")).toBeVisible();
    expect(screen.queryByLabelText(/day streak/)).not.toBeInTheDocument();
    rerender(<ArcHeader day={23} total={66} streak={4} />);
    expect(screen.getByLabelText("4 day streak")).toBeVisible();
  });
  it("uses marks and links to distinguish momentum states", () => {
    render(
      <>
        <MomentumGrid
          days={[
            {
              localDate: "2026-09-01",
              dayNumber: 1,
              status: "completed",
              isToday: false,
            },
            {
              localDate: "2026-09-02",
              dayNumber: 2,
              status: "deliberate-rest",
              isToday: false,
            },
            {
              localDate: "2026-09-03",
              dayNumber: 3,
              status: "broken",
              isToday: false,
            },
            {
              localDate: "2026-09-04",
              dayNumber: 4,
              status: "future",
              isToday: true,
            },
          ]}
        />
        <MomentumLegend />
      </>,
    );
    expect(screen.getByLabelText("Day 1, Completed")).toHaveAttribute(
      "href",
      "/chronicle?date=2026-09-01",
    );
    expect(screen.getByLabelText("Day 4, Future, today")).not.toHaveAttribute(
      "href",
    );
    expect(screen.getByLabelText("Momentum grid legend")).toHaveTextContent(
      "CompletedDeliberate restBrokenFutureToday",
    );
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
