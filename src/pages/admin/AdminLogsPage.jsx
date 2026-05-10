import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  Col,
  Form,
  Row,
  Spinner,
} from "react-bootstrap";
import {
  FaArrowDown,
  FaCopy,
  FaPause,
  FaPlay,
  FaTrash,
} from "react-icons/fa";

import { getLogSources, getLogTail, streamLogFollow } from "../../api";
import { useAppSettings } from "../../context/AppSettingsContext";

const MAX_RENDERED_LINES = 2000;
const DEFAULT_TAIL_SIZE = 200;
const TAIL_SIZE_OPTIONS = [50, 100, 200, 500, 1000, 2000];
const FALLBACK_SOURCES = [
  {
    key: "web",
    label: "Web",
    description: "FastAPI, Gunicorn, and application logs.",
    exists: false,
    sizeBytes: 0,
  },
  {
    key: "caddy",
    label: "Caddy",
    description: "HTTPS reverse proxy access and runtime logs.",
    exists: false,
    sizeBytes: 0,
  },
  {
    key: "booking",
    label: "Booking job",
    description: "Systemd timer and one-off booking job logs.",
    exists: false,
    sizeBytes: 0,
  },
];

const formatBytes = (bytes = 0) => {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const AdminLogsPage = () => {
  const { selectedEnvironment } = useAppSettings();
  const [sources, setSources] = useState(FALLBACK_SOURCES);
  const [selectedSource, setSelectedSource] = useState("web");
  const [tailSize, setTailSize] = useState(DEFAULT_TAIL_SIZE);
  const [logLines, setLogLines] = useState([]);
  const [sourceMeta, setSourceMeta] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isLoadingTail, setIsLoadingTail] = useState(false);
  const [streamStatus, setStreamStatus] = useState("paused");
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("idle");
  const viewerRef = useRef(null);
  const nextLineId = useRef(0);

  const selectedSourceInfo = useMemo(
    () =>
      sources.find((source) => source.key === selectedSource) ||
      FALLBACK_SOURCES.find((source) => source.key === selectedSource) ||
      FALLBACK_SOURCES[0],
    [selectedSource, sources]
  );
  const displayedSourceMeta =
    sourceMeta?.key === selectedSource ? sourceMeta : selectedSourceInfo;

  const buildLineEntry = useCallback((text, type = "line") => {
    const id = `${Date.now()}-${nextLineId.current}`;
    nextLineId.current += 1;

    return {
      id,
      text,
      type,
    };
  }, []);

  const replaceLogLines = useCallback(
    (lines) => {
      const cappedLines = (lines || []).slice(-MAX_RENDERED_LINES);
      setLogLines(cappedLines.map((line) => buildLineEntry(line)));
    },
    [buildLineEntry]
  );

  const appendLogLine = useCallback(
    (text, type = "line") => {
      setLogLines((currentLines) =>
        [...currentLines, buildLineEntry(text, type)].slice(-MAX_RENDERED_LINES)
      );
    },
    [buildLineEntry]
  );

  useEffect(() => {
    let isActive = true;
    setIsLoadingSources(true);
    setError("");

    getLogSources({ environment: selectedEnvironment })
      .then((nextSources) => {
        if (!isActive) {
          return;
        }

        const availableSources =
          Array.isArray(nextSources) && nextSources.length > 0
            ? nextSources
            : FALLBACK_SOURCES;
        setSources(availableSources);

        setSelectedSource((currentSource) =>
          availableSources.some((source) => source.key === currentSource)
            ? currentSource
            : availableSources[0]?.key || "web"
        );
      })
      .catch((requestError) => {
        if (!isActive) {
          return;
        }

        setSources(FALLBACK_SOURCES);
        setError(requestError.message || "Failed to load log sources.");
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingSources(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedEnvironment]);

  useEffect(() => {
    if (isFollowing || !selectedSource) {
      return undefined;
    }

    let isActive = true;
    setIsLoadingTail(true);
    setStreamStatus("paused");
    setError("");

    getLogTail({
      source: selectedSource,
      lines: tailSize,
      environment: selectedEnvironment,
    })
      .then((payload) => {
        if (!isActive) {
          return;
        }

        setSourceMeta(payload.source);
        replaceLogLines(payload.lines || []);
      })
      .catch((requestError) => {
        if (isActive) {
          setError(requestError.message || "Failed to load log tail.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingTail(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    isFollowing,
    replaceLogLines,
    selectedEnvironment,
    selectedSource,
    tailSize,
  ]);

  useEffect(() => {
    if (!isFollowing || !selectedSource) {
      return undefined;
    }

    const controller = new AbortController();
    setStreamStatus("connecting");
    setLogLines([]);
    setError("");

    streamLogFollow({
      source: selectedSource,
      lines: tailSize,
      environment: selectedEnvironment,
      signal: controller.signal,
      onEvent: (event) => {
        if (controller.signal.aborted) {
          return;
        }

        if (event.type === "meta") {
          setStreamStatus("following");
          setSourceMeta((currentMeta) => ({
            ...selectedSourceInfo,
            ...currentMeta,
            key: selectedSource,
            exists: event.exists,
            lineLimit: event.lineLimit,
          }));
          return;
        }

        if (event.type === "rotation") {
          appendLogLine("[log rotated]", "system");
          return;
        }

        if (event.type === "line") {
          appendLogLine(event.line || "");
        }
      },
    })
      .then(() => {
        if (!controller.signal.aborted) {
          setStreamStatus("ended");
          setIsFollowing(false);
        }
      })
      .catch((streamError) => {
        if (!controller.signal.aborted) {
          setStreamStatus("error");
          setError(streamError.message || "Log stream failed.");
          setIsFollowing(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    appendLogLine,
    isFollowing,
    selectedEnvironment,
    selectedSource,
    selectedSourceInfo,
    tailSize,
  ]);

  useEffect(() => {
    if (!autoScroll || !viewerRef.current) {
      return;
    }

    viewerRef.current.scrollTop = viewerRef.current.scrollHeight;
  }, [autoScroll, logLines]);

  useEffect(() => {
    if (copyState !== "copied") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const handleCopyVisibleLogs = async () => {
    try {
      await navigator.clipboard.writeText(
        logLines.map((entry) => entry.text).join("\n")
      );
      setCopyState("copied");
    } catch (copyError) {
      setCopyState("failed");
      setError(copyError.message || "Failed to copy visible logs.");
    }
  };

  const statusLabel = isFollowing
    ? streamStatus === "connecting"
      ? "Connecting"
      : "Following"
    : "Paused";
  const isBusy = isLoadingSources || isLoadingTail;

  return (
    <div className="admin-logs-page">
      <div className="page-heading admin-section-heading">
        <div>
          <h2>Logs</h2>
          <p className="page-subtitle">{selectedSourceInfo.description}</p>
        </div>
        <div className="logs-status-badges">
          <Badge bg={isFollowing ? "success" : "secondary"}>{statusLabel}</Badge>
          <Badge bg={displayedSourceMeta?.exists ? "dark" : "warning"}>
            {displayedSourceMeta?.exists ? "File ready" : "No file yet"}
          </Badge>
          <Badge bg="secondary">
            {formatBytes(displayedSourceMeta?.sizeBytes || 0)}
          </Badge>
        </div>
      </div>

      {error ? (
        <Alert
          dismissible
          variant="danger"
          onClose={() => setError("")}
          className="logs-alert"
        >
          {error}
        </Alert>
      ) : null}

      <Card className="surface-card logs-toolbar-card">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col md={4} lg={3}>
              <Form.Group controlId="logs-source">
                <Form.Label>Source</Form.Label>
                <Form.Select
                  value={selectedSource}
                  onChange={(event) => setSelectedSource(event.target.value)}
                  disabled={isLoadingSources}
                >
                  {sources.map((source) => (
                    <option value={source.key} key={source.key}>
                      {source.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>

            <Col md={3} lg={2}>
              <Form.Group controlId="logs-tail-size">
                <Form.Label>Tail</Form.Label>
                <Form.Select
                  value={tailSize}
                  onChange={(event) =>
                    setTailSize(Number.parseInt(event.target.value, 10))
                  }
                >
                  {TAIL_SIZE_OPTIONS.map((option) => (
                    <option value={option} key={option}>
                      {option} lines
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>

            <Col md={5} lg={4}>
              <ButtonGroup className="logs-actions">
                <Button
                  variant={isFollowing ? "outline-secondary" : "primary"}
                  onClick={() =>
                    setIsFollowing((currentValue) => !currentValue)
                  }
                  disabled={!selectedSource}
                >
                  {isFollowing ? <FaPause /> : <FaPlay />}
                  <span>{isFollowing ? "Pause" : "Follow"}</span>
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => setLogLines([])}
                >
                  <FaTrash />
                  <span>Clear</span>
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={handleCopyVisibleLogs}
                  disabled={logLines.length === 0}
                >
                  <FaCopy />
                  <span>{copyState === "copied" ? "Copied" : "Copy"}</span>
                </Button>
              </ButtonGroup>
            </Col>

            <Col lg={3}>
              <div className="logs-autoscroll-control">
                <Form.Check
                  type="switch"
                  id="logs-autoscroll"
                  label="Auto-scroll"
                  checked={autoScroll}
                  onChange={(event) => setAutoScroll(event.target.checked)}
                />
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    if (viewerRef.current) {
                      viewerRef.current.scrollTop =
                        viewerRef.current.scrollHeight;
                    }
                  }}
                >
                  <FaArrowDown />
                </Button>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="surface-card logs-viewer-card">
        <Card.Header className="logs-viewer-header">
          <div>
            <strong>{selectedSourceInfo.label}</strong>
            <span>{displayedSourceMeta?.filename || `${selectedSource}.log`}</span>
          </div>
          <div className="logs-viewer-meta">
            {isBusy ? (
              <span className="logs-loading">
                <Spinner animation="border" size="sm" />
                Loading
              </span>
            ) : null}
            <span>
              {logLines.length.toLocaleString()} /{" "}
              {MAX_RENDERED_LINES.toLocaleString()}
            </span>
          </div>
        </Card.Header>
        <Card.Body className="logs-viewer-body">
          <div
            className="logs-terminal"
            ref={viewerRef}
            role="log"
            aria-live={isFollowing ? "polite" : "off"}
          >
            {logLines.length > 0 ? (
              logLines.map((entry) => (
                <div
                  className={`logs-line logs-line-${entry.type}`}
                  key={entry.id}
                >
                  {entry.text || " "}
                </div>
              ))
            ) : (
              <div className="logs-empty-line">No log lines.</div>
            )}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default AdminLogsPage;
