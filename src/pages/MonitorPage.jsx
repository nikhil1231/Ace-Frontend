import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Container, Spinner } from "react-bootstrap";
import { FaCheck, FaClock, FaExclamationTriangle, FaServer, FaDesktop, FaMicrochip } from "react-icons/fa";
import { useSearchParams } from "react-router-dom";

import { requestApi } from "../api";
import { useAppSettings } from "../context/AppSettingsContext";
import { fdatetime, minutesToTime } from "../util";

import "./MonitorPage.css";

const POLL_INTERVAL_MS = 2000;

const BOOKING_STAGES = [
  { key: "queued", label: "Queued" },
  { key: "pre_warmup", label: "Warmup" },
  { key: "finding_slots", label: "Slots" },
  { key: "preparing_payment", label: "Payment prep" },
  { key: "waiting_for_window", label: "Window" },
  { key: "firing_booking", label: "Fire" },
  { key: "refreshing_bookings", label: "Refresh" },
  { key: "succeeded", label: "Done" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
  { key: "dry_run", label: "Dry-run" },
];

const TERMINAL_STAGES = new Set(["succeeded", "failed", "skipped", "dry_run"]);

const componentIcons = {
  frontend: FaDesktop,
  backend: FaServer,
  worker: FaMicrochip,
};

const statusLabels = {
  ok: "Online",
  warn: "Stale",
  unknown: "Unknown",
  down: "Down",
};

const formatTarget = (target) => {
  if (!target) {
    return "Unknown target";
  }
  const startTime = minutesToTime(target.StartTime);
  const endTime = minutesToTime(target.EndTime);
  return `${target.Venue || "Unknown venue"} · ${target.Date || "Unknown date"} · ${startTime}-${endTime}`;
};

const getRunStageIndex = (stage) => {
  const index = BOOKING_STAGES.findIndex((item) => item.key === stage);
  return index >= 0 ? index : 0;
};

const HealthNode = ({ component }) => {
  const Icon = componentIcons[component.key] || FaServer;
  const status = component.status || "unknown";

  return (
    <article className={`monitor-health-node monitor-health-${status}`}>
      <div className="monitor-health-node-top">
        <span className="monitor-health-icon">
          <Icon />
        </span>
        <span className="monitor-health-light" aria-label={`${component.label} ${statusLabels[status] || status}`} />
      </div>
      <div>
        <h2>{component.label}</h2>
        <p>{statusLabels[status] || status}</p>
      </div>
      <span className="monitor-health-detail">{component.detail}</span>
    </article>
  );
};

const StagePill = ({ stage, runStage, index }) => {
  const currentIndex = getRunStageIndex(runStage);
  const isCurrent = stage.key === runStage;
  const isTerminalCurrent = isCurrent && TERMINAL_STAGES.has(stage.key);
  const isComplete = (index < currentIndex && !TERMINAL_STAGES.has(stage.key)) || isTerminalCurrent;
  const isSkippedTerminal =
    TERMINAL_STAGES.has(stage.key) && stage.key !== runStage && TERMINAL_STAGES.has(runStage);

  return (
    <span
      className={[
        "monitor-stage",
        isComplete ? "monitor-stage-complete" : "",
        isCurrent ? "monitor-stage-current" : "",
        isSkippedTerminal ? "monitor-stage-muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isComplete ? <FaCheck /> : <FaClock />}
      {stage.label}
    </span>
  );
};

const RunCard = ({ run, highlighted }) => {
  const details = run.details || {};
  const status = run.status || "active";
  const stage = run.stage || "queued";
  const isProblem = stage === "failed" || status === "failed";

  return (
    <article className={`monitor-run-card${highlighted ? " monitor-run-card-highlight" : ""}`}>
      <div className="monitor-run-head">
        <div>
          <p className="monitor-run-eyebrow">
            {run.source || "booking"} · {run.dryRun ? "dry-run" : "live"}
          </p>
          <h2>{formatTarget(run.target)}</h2>
        </div>
        <span className={`monitor-run-status monitor-run-status-${isProblem ? "failed" : status}`}>
          {isProblem ? <FaExclamationTriangle /> : <FaClock />}
          {stage.replaceAll("_", " ")}
        </span>
      </div>

      <div className="monitor-stage-track">
        {BOOKING_STAGES.map((item, index) => (
          <StagePill key={item.key} stage={item} runStage={stage} index={index} />
        ))}
      </div>

      <div className="monitor-run-meta">
        <span>Started {fdatetime(run.createdAt)}</span>
        <span>Updated {fdatetime(run.updatedAt)}</span>
        {details.slotCount !== undefined ? <span>{details.slotCount} slot(s)</span> : null}
        {details.successes !== undefined ? <span>{details.successes} paid</span> : null}
        {details.failures !== undefined ? <span>{details.failures} failed</span> : null}
      </div>

      <p className="monitor-run-message">{run.message || "Waiting for the next update."}</p>

      {Array.isArray(run.events) && run.events.length > 0 ? (
        <details className="monitor-events">
          <summary>{run.events.length} event{run.events.length === 1 ? "" : "s"}</summary>
          <ol>
            {run.events.slice(-8).map((event, index) => (
              <li key={`${event.createdAt}-${event.stage}-${index}`}>
                <span>{fdatetime(event.createdAt)}</span>
                <strong>{event.stage.replaceAll("_", " ")}</strong>
                <em>{event.message}</em>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
};

const UpcomingTarget = ({ item }) => (
  <article className="monitor-upcoming-item">
    <div>
      <strong>{formatTarget(item.target)}</strong>
      <span>
        Opens {fdatetime(item.openAt)} · warmup {fdatetime(item.warmupAt)}
      </span>
    </div>
    <span className={item.scheduled ? "monitor-upcoming-state scheduled" : "monitor-upcoming-state"}>
      {item.scheduled ? "Scheduled" : "Pending"}
    </span>
  </article>
);

const MonitorPage = () => {
  const { hasAdminAccess } = useAppSettings();
  const [searchParams] = useSearchParams();
  const highlightedRunId = searchParams.get("runId");
  const pollStartedAt = useRef(Date.now());

  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState(null);

  const loadStatus = useCallback(async ({ initial = false } = {}) => {
    if (!hasAdminAccess) {
      setIsLoading(false);
      return;
    }

    if (initial) {
      setIsLoading(true);
    }

    const result = await requestApi({
      path: "/monitor/status",
      requiresAuth: true,
    });

    if (result.ok) {
      setPayload(result.data);
      setLastPoll({
        at: new Date().toISOString(),
        durationMs: result.durationMs,
      });
      setError("");
    } else {
      setError(result.error || "Failed to load monitor status.");
      setPayload((currentValue) => ({
        ...(currentValue || {}),
        components: {
          ...(currentValue?.components || {}),
          backend: {
            key: "backend",
            label: "DigitalOcean backend",
            status: "down",
            detail: result.status === 0 ? "Backend is unreachable." : result.error,
            lastSeenAt: null,
          },
        },
      }));
    }

    setIsLoading(false);
  }, [hasAdminAccess]);

  useEffect(() => {
    loadStatus({ initial: true });
    const intervalId = window.setInterval(() => loadStatus(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadStatus]);

  const components = useMemo(() => {
    const backend = payload?.components?.backend || {
      key: "backend",
      label: "DigitalOcean backend",
      status: isLoading || !hasAdminAccess ? "unknown" : "down",
      detail: !hasAdminAccess
        ? "Admin token required for monitor checks."
        : isLoading
          ? "Checking backend..."
          : "No backend response.",
    };
    const worker = payload?.components?.worker || {
      key: "worker",
      label: "Linux worker",
      status: "unknown",
      detail: "No worker data yet.",
    };
    const frontend = {
      key: "frontend",
      label: "Frontend",
      status: "ok",
      detail: `Polling for ${Math.max(1, Math.round((Date.now() - pollStartedAt.current) / 1000))}s.`,
    };

    return [frontend, backend, worker];
  }, [hasAdminAccess, isLoading, payload]);

  const runs = useMemo(() => {
    const active = payload?.runs?.active || [];
    const recent = payload?.runs?.recent || [];
    const seen = new Set();
    return [...active, ...recent].filter((run) => {
      if (!run?.id || seen.has(run.id)) {
        return false;
      }
      seen.add(run.id);
      return true;
    });
  }, [payload]);

  return (
    <Container fluid="lg" className="page-container monitor-page">
      <section className="monitor-page-head">
        <div>
          <h1>Monitor</h1>
          <p>System health and live booking flow status.</p>
        </div>
        <div className="monitor-poll-meta">
          {isLoading ? (
            <>
              <Spinner animation="border" size="sm" />
              Checking
            </>
          ) : (
            <>
              <span className="monitor-health-light monitor-health-light-inline" />
              {lastPoll ? `${lastPoll.durationMs} ms · ${fdatetime(lastPoll.at)}` : "Waiting"}
            </>
          )}
        </div>
      </section>

      {!hasAdminAccess ? (
        <Alert variant="warning">
          Admin token is required to view booking monitor data.
        </Alert>
      ) : null}

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <section className="monitor-health-map" aria-label="Component health">
        {components.map((component, index) => (
          <React.Fragment key={component.key}>
            <HealthNode component={component} />
            {index < components.length - 1 ? <span className="monitor-health-link" aria-hidden="true" /> : null}
          </React.Fragment>
        ))}
      </section>

      <section className="monitor-section">
        <div className="monitor-section-head">
          <h2>Booking flows</h2>
          <span>{runs.length} visible</span>
        </div>
        {isLoading ? (
          <div className="monitor-empty">
            <Spinner animation="border" size="sm" />
            <span>Loading monitor data...</span>
          </div>
        ) : null}
        {!isLoading && runs.length === 0 ? (
          <div className="monitor-empty">No active or recent booking flows yet.</div>
        ) : null}
        <div className="monitor-run-list">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} highlighted={run.id === highlightedRunId} />
          ))}
        </div>
      </section>

      <section className="monitor-section">
        <div className="monitor-section-head">
          <h2>Upcoming targets</h2>
          <span>{payload?.upcomingTargets?.length || 0} target(s)</span>
        </div>
        {Array.isArray(payload?.upcomingTargets) && payload.upcomingTargets.length > 0 ? (
          <div className="monitor-upcoming-list">
            {payload.upcomingTargets.map((item) => (
              <UpcomingTarget key={item.targetKey} item={item} />
            ))}
          </div>
        ) : (
          <div className="monitor-empty">No upcoming target timing is available.</div>
        )}
      </section>
    </Container>
  );
};

export default MonitorPage;
