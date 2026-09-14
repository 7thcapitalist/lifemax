"use client";

import { useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { useRequireSession } from "@/components/useRequireSession";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenIntro,
} from "@/design-system";
import { ApiError, apiFetch } from "@/lib/api";
import type { AcademicEntryView } from "@/lib/game-types";
import { useResource } from "@/lib/useResource";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  dropped: "Dropped",
};

type StatusDraft = "" | Exclude<AcademicEntryView["status"], null>;

const emptyDraft = {
  kind: "",
  title: "",
  course: "",
  term: "",
  dueDate: "",
  status: "" as StatusDraft,
  scoreValue: "",
  scoreScale: "",
  notes: "",
};

export default function AcademicsPage() {
  const { boot } = useRequireSession({ requireOnboardingComplete: true });
  const { resource, reload } = useResource<AcademicEntryView[]>(
    boot ? "/api/v1/academics" : null,
    (items) => !items.length,
  );
  const [draft, setDraft] = useState(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.kind.trim() || !draft.title.trim()) return;
    setSubmitting(true);
    setFormError("");
    try {
      await apiFetch("/api/v1/academics", {
        method: "POST",
        body: JSON.stringify({
          kind: draft.kind.trim(),
          title: draft.title.trim(),
          course: draft.course.trim() || null,
          term: draft.term.trim() || null,
          dueDate: draft.dueDate || null,
          status: draft.status || null,
          scoreValue: draft.scoreValue.trim() || null,
          scoreScale: draft.scoreScale.trim() || null,
          notes: draft.notes.trim() || null,
        }),
      });
      setDraft(emptyDraft);
      await reload();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Entry could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell showNav subtitle="Academic progress">
      <main className="screen">
        <ScreenIntro eyebrow="Academics" title="One dimension of the character">
          Courses, assignments, and GPA are evidence you enter yourself — one
          input to your attributes, not a verdict on who you are.
        </ScreenIntro>
        {resource.status === "loading" ? (
          <LoadingState label="Loading academic record…" />
        ) : null}
        {resource.status === "error" ? (
          <ErrorState message={resource.message} retry={() => void reload()} />
        ) : null}
        {resource.status === "empty" ? (
          <EmptyState
            title="No academic entries yet"
            message="Add a course, assignment, or GPA snapshot below to track it here."
          />
        ) : null}
        {resource.status === "ready" ? (
          <section className="screen-grid" aria-label="Academic entries">
            {resource.data.map((entry) => (
              <article className="premium-card stack-sm" key={entry.id}>
                <div className="card-topline">
                  <Badge tone={entry.status ?? "neutral"}>
                    {entry.status ? STATUS_LABEL[entry.status] : entry.kind}
                  </Badge>
                  {entry.scoreValue ? (
                    <strong>
                      {entry.scoreValue}
                      {entry.scoreScale ? ` / ${entry.scoreScale}` : ""}
                    </strong>
                  ) : null}
                </div>
                <h2>{entry.title}</h2>
                {entry.course || entry.term ? (
                  <p className="meta">
                    {[entry.course, entry.term].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {entry.dueDate ? (
                  <p className="meta">
                    Due {new Date(entry.dueDate).toLocaleDateString()}
                  </p>
                ) : null}
                {entry.notes ? <p>{entry.notes}</p> : null}
              </article>
            ))}
          </section>
        ) : null}
        <section className="premium-card stack" aria-labelledby="add-academic">
          <h2 id="add-academic">Add an entry</h2>
          {formError ? <ErrorState message={formError} /> : null}
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="academic-kind">Kind</label>
              <input
                id="academic-kind"
                required
                maxLength={100}
                placeholder="gpa, course, assignment, exam…"
                value={draft.kind}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, kind: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-title">Title</label>
              <input
                id="academic-title"
                required
                maxLength={200}
                placeholder="Fall 2026 GPA, ECON 301 problem set…"
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-course">Course</label>
              <input
                id="academic-course"
                maxLength={200}
                value={draft.course}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, course: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-term">Term</label>
              <input
                id="academic-term"
                maxLength={100}
                placeholder="Fall 2026"
                value={draft.term}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, term: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-due">Due date</label>
              <input
                id="academic-due"
                type="date"
                value={draft.dueDate}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, dueDate: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-status">Status</label>
              <select
                id="academic-status"
                value={draft.status}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    status: e.target.value as StatusDraft,
                  }))
                }
              >
                <option value="">Unspecified</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="academic-score">Score</label>
              <input
                id="academic-score"
                maxLength={100}
                placeholder="3.72"
                value={draft.scoreValue}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, scoreValue: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-scale">Scale</label>
              <input
                id="academic-scale"
                maxLength={100}
                placeholder="4.0"
                value={draft.scoreScale}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, scoreScale: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="academic-notes">Notes</label>
              <textarea
                id="academic-notes"
                maxLength={2000}
                value={draft.notes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </div>
            <div className="btn-row">
              <button
                className="btn-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Add entry"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
