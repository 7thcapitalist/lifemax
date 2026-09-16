"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner, LiveRegion } from "@/components/Feedback";
import { useRequireSession } from "@/components/useRequireSession";
import { ApiError, apiFetch } from "@/lib/api";

type AspectDraft = {
  name: string;
  definition: string;
  desiredIdentity: string;
  emphasis: "active" | "maintenance" | "dormant";
};

type MilestoneDraft = {
  title: string;
  doneCondition: string;
  aspectIndexes: number[];
};

const STEPS = [
  "Becoming",
  "Aspects",
  "North Stars",
  "Chapter",
  "Guardrails",
] as const;

const defaultAspect = (): AspectDraft => ({
  name: "",
  definition: "",
  desiredIdentity: "",
  emphasis: "active",
});

function formatLocalDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function localDatePlusWeeks(weeks: number, timeZone?: string): string {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return formatLocalDate(date, timeZone);
}

function todayLocal(timeZone?: string): string {
  return formatLocalDate(new Date(), timeZone);
}

export default function OnboardingPage() {
  const router = useRouter();
  const { boot, error: sessionError } = useRequireSession({
    requireOnboardingIncomplete: true,
  });
  const [step, setStep] = useState(0);
  const [becomingStatement, setBecomingStatement] = useState("");
  const [aspects, setAspects] = useState<AspectDraft[]>([
    defaultAspect(),
    defaultAspect(),
    defaultAspect(),
    defaultAspect(),
  ]);
  const [northStars, setNorthStars] = useState([{ title: "", motivation: "" }]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterIntent, setChapterIntent] = useState("");
  const [startDate, setStartDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState(localDatePlusWeeks(8));
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { title: "", doneCondition: "", aspectIndexes: [0] },
  ]);
  const [guardrails, setGuardrails] = useState([
    {
      category: "recovery" as const,
      statement: "",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [datesAligned, setDatesAligned] = useState(false);

  useEffect(() => {
    if (!boot || !boot.authenticated || datesAligned) return;
    const timeZone = boot.owner.timezone;
    setStartDate(todayLocal(timeZone));
    setEndDate(localDatePlusWeeks(8, timeZone));
    setDatesAligned(true);
  }, [boot, datesAligned]);

  const progress = useMemo(
    () => STEPS.map((_, index) => index <= step),
    [step],
  );

  function updateAspect(index: number, patch: Partial<AspectDraft>) {
    setAspects((current) =>
      current.map((aspect, i) =>
        i === index ? { ...aspect, ...patch } : aspect,
      ),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus("Saving character…");
    try {
      await apiFetch("/api/v1/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          becomingStatement,
          aspects,
          northStars: northStars.filter((item) => item.title.trim()),
          chapter: {
            title: chapterTitle,
            intent: chapterIntent,
            startDate,
            endDate,
            milestones,
          },
          guardrails,
        }),
      });
      setStatus("Character sealed.");
      router.replace("/program?from=onboarding");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Onboarding could not be completed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  if (!boot) {
    return (
      <AppShell>
        <main className="panel">
          <ErrorBanner message={sessionError} />
          <LiveRegion message="Loading onboarding…" />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell subtitle="Character onboarding">
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">First morning</p>
          <h1>Who are you becoming?</h1>
          <p>
            Shape the aspects, ambitions, and guardrails that will guide a small
            daily plan.
          </p>
        </div>
        <div className="wizard-progress" aria-hidden="true">
          {progress.map((active, index) => (
            <span key={STEPS[index]} data-active={active} />
          ))}
        </div>
        <p className="meta">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <ErrorBanner message={error ?? sessionError} />
        <LiveRegion message={status} />
        <form className="stack" onSubmit={onSubmit}>
          {step === 0 ? (
            <div className="field">
              <label htmlFor="becoming">Becoming statement</label>
              <textarea
                id="becoming"
                required
                maxLength={2000}
                value={becomingStatement}
                onChange={(e) => setBecomingStatement(e.target.value)}
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="stack">
              <p>
                Choose 4–6 aspects. Each needs a definition, desired identity,
                and emphasis.
              </p>
              {aspects.map((aspect, index) => (
                <fieldset key={index} className="stack-sm">
                  <legend>Aspect {index + 1}</legend>
                  <div className="field">
                    <label htmlFor={`aspect-name-${index}`}>Name</label>
                    <input
                      id={`aspect-name-${index}`}
                      required
                      maxLength={100}
                      value={aspect.name}
                      onChange={(e) =>
                        updateAspect(index, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`aspect-def-${index}`}>Definition</label>
                    <textarea
                      id={`aspect-def-${index}`}
                      required
                      maxLength={1000}
                      value={aspect.definition}
                      onChange={(e) =>
                        updateAspect(index, { definition: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`aspect-id-${index}`}>
                      Desired identity
                    </label>
                    <textarea
                      id={`aspect-id-${index}`}
                      required
                      maxLength={1000}
                      value={aspect.desiredIdentity}
                      onChange={(e) =>
                        updateAspect(index, {
                          desiredIdentity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`aspect-emph-${index}`}>Emphasis</label>
                    <select
                      id={`aspect-emph-${index}`}
                      value={aspect.emphasis}
                      onChange={(e) =>
                        updateAspect(index, {
                          emphasis: e.target.value as AspectDraft["emphasis"],
                        })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="dormant">Dormant</option>
                    </select>
                  </div>
                </fieldset>
              ))}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={aspects.length >= 6}
                  onClick={() =>
                    setAspects((list) => [...list, defaultAspect()])
                  }
                >
                  Add aspect
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={aspects.length <= 4}
                  onClick={() => setAspects((list) => list.slice(0, -1))}
                >
                  Remove last
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="stack">
              <p>
                Add up to three North Stars. At least one keeps focus clear.
              </p>
              {northStars.map((star, index) => (
                <fieldset key={index} className="stack-sm">
                  <legend>North Star {index + 1}</legend>
                  <div className="field">
                    <label htmlFor={`ns-title-${index}`}>Title</label>
                    <input
                      id={`ns-title-${index}`}
                      required={index === 0}
                      maxLength={200}
                      value={star.title}
                      onChange={(e) =>
                        setNorthStars((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, title: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`ns-mot-${index}`}>Motivation</label>
                    <textarea
                      id={`ns-mot-${index}`}
                      required={Boolean(star.title.trim())}
                      maxLength={1000}
                      value={star.motivation}
                      onChange={(e) =>
                        setNorthStars((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, motivation: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                </fieldset>
              ))}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={northStars.length >= 3}
                  onClick={() =>
                    setNorthStars((list) => [
                      ...list,
                      { title: "", motivation: "" },
                    ])
                  }
                >
                  Add North Star
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="chapter-title">Chapter title</label>
                <input
                  id="chapter-title"
                  required
                  maxLength={200}
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="chapter-intent">Intent</label>
                <textarea
                  id="chapter-intent"
                  required
                  maxLength={2000}
                  value={chapterIntent}
                  onChange={(e) => setChapterIntent(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="start-date">Start date</label>
                <input
                  id="start-date"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="end-date">End date (6–12 weeks)</label>
                <input
                  id="end-date"
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              {milestones.map((milestone, index) => (
                <fieldset key={index} className="stack-sm">
                  <legend>Milestone {index + 1}</legend>
                  <div className="field">
                    <label htmlFor={`ms-title-${index}`}>Title</label>
                    <input
                      id={`ms-title-${index}`}
                      required
                      maxLength={200}
                      value={milestone.title}
                      onChange={(e) =>
                        setMilestones((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, title: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`ms-done-${index}`}>Done condition</label>
                    <textarea
                      id={`ms-done-${index}`}
                      required
                      maxLength={1000}
                      value={milestone.doneCondition}
                      onChange={(e) =>
                        setMilestones((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, doneCondition: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`ms-aspect-${index}`}>Linked aspect</label>
                    <select
                      id={`ms-aspect-${index}`}
                      value={milestone.aspectIndexes[0] ?? 0}
                      onChange={(e) =>
                        setMilestones((list) =>
                          list.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  aspectIndexes: [Number(e.target.value)],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      {aspects.map((aspect, aspectIndex) => (
                        <option key={aspectIndex} value={aspectIndex}>
                          {aspect.name || `Aspect ${aspectIndex + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              ))}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={milestones.length >= 3}
                  onClick={() =>
                    setMilestones((list) => [
                      ...list,
                      { title: "", doneCondition: "", aspectIndexes: [0] },
                    ])
                  }
                >
                  Add milestone
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="stack">
              <p>
                Set at least one guardrail the morning briefing should honor.
              </p>
              {guardrails.map((guardrail, index) => (
                <fieldset key={index} className="stack-sm">
                  <legend>Guardrail {index + 1}</legend>
                  <div className="field">
                    <label htmlFor={`gr-cat-${index}`}>Category</label>
                    <select
                      id={`gr-cat-${index}`}
                      value={guardrail.category}
                      onChange={(e) =>
                        setGuardrails((list) =>
                          list.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  category: e.target
                                    .value as (typeof guardrails)[number]["category"],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="sleep">Sleep</option>
                      <option value="connection">Connection</option>
                      <option value="recovery">Recovery</option>
                      <option value="novelty">Novelty</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`gr-stmt-${index}`}>Statement</label>
                    <textarea
                      id={`gr-stmt-${index}`}
                      required
                      maxLength={1000}
                      value={guardrail.statement}
                      onChange={(e) =>
                        setGuardrails((list) =>
                          list.map((item, i) =>
                            i === index
                              ? { ...item, statement: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}

          <div className="btn-row">
            {step > 0 ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setStep((value) => value - 1)}
              >
                Back
              </button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStep((value) => value + 1)}
              >
                Continue
              </button>
            ) : (
              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? "Sealing…" : "Complete onboarding"}
              </button>
            )}
          </div>
        </form>
      </main>
    </AppShell>
  );
}
