/** Shared synthetic constants for browser E2E. Password never logged. */
export const E2E_PASSWORD = "synthetic-e2e-passphrase";
export const E2E_DISPLAY_NAME = "Synthetic Owner";
export const E2E_TIMEZONE = "UTC";

export const onboardingFixture = {
  becomingStatement: "Become a grounded synthetic builder who protects rest.",
  aspects: [
    {
      name: "Builder",
      definition: "Make durable private systems",
      desiredIdentity: "A careful builder",
      emphasis: "active",
    },
    {
      name: "Body",
      definition: "Sustain energy without burnout",
      desiredIdentity: "A recovered athlete",
      emphasis: "active",
    },
    {
      name: "Scholar",
      definition: "Learn with depth",
      desiredIdentity: "A patient scholar",
      emphasis: "maintenance",
    },
    {
      name: "Explorer",
      definition: "Protect novelty and rest",
      desiredIdentity: "A curious explorer",
      emphasis: "active",
    },
  ],
  northStar: {
    title: "Ship the private ritual",
    motivation: "Learn what mornings need",
  },
  chapter: {
    title: "Foundation chapter",
    intent: "Establish the quiet morning loop",
    startDate: "2026-08-01",
    endDate: "2026-09-26",
  },
  milestone: {
    title: "Morning loop works",
    doneCondition: "Complete one resolve-capacity-briefing-quest morning",
  },
  guardrail: {
    category: "recovery",
    statement: "Do not let work displace sleep",
  },
};
