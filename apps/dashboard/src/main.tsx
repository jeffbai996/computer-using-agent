import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentSession, TraceEvent } from "@cua/core";
import "./styles.css";

type ApiState = {
  sessions: AgentSession[];
  selected?: AgentSession;
  error?: string;
};

function App() {
  const [task, setTask] = useState("");
  const [state, setState] = useState<ApiState>({ sessions: [] });
  const [isBusy, setIsBusy] = useState(false);

  async function refresh(selectedId = state.selected?.id) {
    const sessions = await fetchJson<AgentSession[]>("/api/sessions");
    const selected = selectedId
      ? await fetchJson<AgentSession>(`/api/sessions/${selectedId}`)
      : sessions[0];

    setState({ sessions, selected });
  }

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    });
  }, []);

  async function startTask() {
    if (!task.trim()) {
      return;
    }

    setIsBusy(true);
    try {
      const session = await fetchJson<AgentSession>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      setTask("");
      await refresh(session.id);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setIsBusy(false);
    }
  }

  async function decide(approved: boolean) {
    const selected = state.selected;

    if (!selected) {
      return;
    }

    setIsBusy(true);
    try {
      const endpoint = approved ? "approve" : "reject";
      await fetchJson<AgentSession>(`/api/sessions/${selected.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: approved ? undefined : "Rejected in dashboard" }),
      });
      await refresh(selected.id);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setIsBusy(false);
    }
  }

  const screenshotEvent = [...(state.selected?.events ?? [])]
    .reverse()
    .find((event) => event.type === "screenshot.captured");

  return (
    <main className="shell">
      <section className="command-strip" aria-label="Task launcher">
        <div>
          <p className="eyebrow">Local CUA console</p>
          <h1>Give the agent one narrow browser job.</h1>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void startTask();
          }}
        >
          <input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Example: open a browser and click the mock button"
          />
          <button disabled={isBusy || !task.trim()}>Start</button>
        </form>
      </section>

      {state.error ? <p className="error">{state.error}</p> : null}

      <section className="workspace" aria-label="Agent workspace">
        <aside className="sessions">
          <h2>Sessions</h2>
          {state.sessions.map((session) => (
            <button
              key={session.id}
              className={session.id === state.selected?.id ? "session active" : "session"}
              onClick={() => void refresh(session.id)}
            >
              <span>{session.task}</span>
              <small>{session.status}</small>
            </button>
          ))}
        </aside>

        <section className="run-panel" aria-label="Selected session">
          {state.selected ? (
            <>
              <div className="run-header">
                <div>
                  <p className="eyebrow">{state.selected.status}</p>
                  <h2>{state.selected.task}</h2>
                </div>
                <div className="approval-bar">
                  <button
                    disabled={isBusy || state.selected.status !== "awaiting_approval"}
                    onClick={() => void decide(true)}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary"
                    disabled={isBusy || state.selected.status !== "awaiting_approval"}
                    onClick={() => void decide(false)}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="screen-and-trace">
                <figure className="screen">
                  {screenshotEvent ? (
                    <img
                      src={String(screenshotEvent.data.screenshotPath)}
                      alt="Latest agent screenshot"
                    />
                  ) : (
                    <figcaption>No screenshot captured yet.</figcaption>
                  )}
                </figure>
                <EventTrace events={state.selected.events} />
              </div>
            </>
          ) : (
            <p className="empty">Start a task to create the first local session.</p>
          )}
        </section>
      </section>
    </main>
  );
}

function EventTrace({ events }: { events: TraceEvent[] }) {
  return (
    <ol className="trace">
      {events.map((event) => (
        <li key={event.id}>
          <strong>{event.type}</strong>
          <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
        </li>
      ))}
    </ol>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
