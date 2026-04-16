import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Row } from "react-bootstrap";

import { buildApiUrl, requestApi } from "../../api";
import { ADMIN_ENDPOINTS, ADMIN_SECTIONS } from "../../admin/endpoints";
import { useAppSettings } from "../../context/AppSettingsContext";
import {
  getRequestHistory,
  subscribeToAdminDataChange,
} from "../../util";

const diagnosticChecks = [
  {
    key: "venues",
    label: "Saved venues",
    request: {
      method: "GET",
      path: "/venues",
    },
  },
  {
    key: "bookings",
    label: "Bookings cache",
    request: {
      method: "GET",
      path: "/booking/bookings",
    },
  },
  {
    key: "targets",
    label: "Booking targets",
    request: {
      method: "GET",
      path: "/booking/targets",
    },
  },
];

const AdminOverviewPage = () => {
  const { backendUrl, hasAdminAccess, selectedEnvironment, token } =
    useAppSettings();
  const [diagnostics, setDiagnostics] = useState([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    return subscribeToAdminDataChange(() => {
      setHistoryVersion((currentValue) => currentValue + 1);
    });
  }, []);

  const recentHistory = getRequestHistory(selectedEnvironment).slice(0, 10);
  const sectionSummaries = ADMIN_SECTIONS.filter(
    (section) => section.key !== "overview"
  ).map((section) => ({
    ...section,
    endpointCount: ADMIN_ENDPOINTS.filter(
      (endpoint) => endpoint.section === section.key
    ).length,
  }));

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    const results = await Promise.all(
      diagnosticChecks.map(async (check) => ({
        ...check,
        result: await requestApi(check.request),
      }))
    );
    setDiagnostics(results);
    setIsRunningDiagnostics(false);
  };

  return (
    <div key={historyVersion}>
      <Row className="g-4">
        <Col xl={4}>
          <Card className="surface-card h-100">
            <Card.Body>
              <Card.Title>Session status</Card.Title>
              <div className="overview-list">
                <div className="overview-list-item">
                  <span>Environment</span>
                  <strong>
                    {selectedEnvironment === "local" ? "Local" : "Hosted"}
                  </strong>
                </div>
                <div className="overview-list-item">
                  <span>Backend URL</span>
                  <code>{backendUrl}</code>
                </div>
                <div className="overview-list-item">
                  <span>Token stored</span>
                  <strong>{token ? "Yes" : "No"}</strong>
                </div>
                <div className="overview-list-item">
                  <span>Admin access</span>
                  <strong>{hasAdminAccess ? "Unlocked" : "Locked"}</strong>
                </div>
              </div>
              <div className="admin-link-list">
                <a href={buildApiUrl("/docs")} target="_blank" rel="noreferrer">
                  Open API docs
                </a>
                <a
                  href={buildApiUrl("/openapi.json")}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open OpenAPI schema
                </a>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xl={4}>
          <Card className="surface-card h-100">
            <Card.Body>
              <Card.Title>Quick diagnostics</Card.Title>
              <p className="page-subtitle compact-subtitle">
                Run a few safe public endpoints to see whether the selected
                backend is reachable and responding.
              </p>
              <Button
                onClick={handleRunDiagnostics}
                disabled={isRunningDiagnostics}
              >
                {isRunningDiagnostics ? "Running checks..." : "Run diagnostics"}
              </Button>
              <div className="diagnostic-list">
                {diagnostics.length > 0 ? (
                  diagnostics.map((check) => (
                    <div className="diagnostic-item" key={check.key}>
                      <div>
                        <strong>{check.label}</strong>
                        <div className="diagnostic-item-meta">
                          {check.request.method} {check.request.path}
                        </div>
                      </div>
                      <Badge bg={check.result.ok ? "success" : "danger"}>
                        {check.result.status || "ERR"}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="empty-state-text">
                    No diagnostics run yet for this environment.
                  </p>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xl={4}>
          <Card className="surface-card h-100">
            <Card.Body>
              <Card.Title>Coverage</Card.Title>
              <div className="coverage-summary">
                <div className="coverage-total">
                  <strong>{ADMIN_ENDPOINTS.length}</strong>
                  <span>backend routes covered by the Admin tab</span>
                </div>
                {sectionSummaries.map((section) => (
                  <div className="coverage-item" key={section.key}>
                    <span>{section.label}</span>
                    <Badge bg="secondary">{section.endpointCount}</Badge>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12}>
          <Card className="surface-card">
            <Card.Body>
              <Card.Title>Recent request history</Card.Title>
              {recentHistory.length > 0 ? (
                <div className="history-list">
                  {recentHistory.map((entry) => (
                    <div className="history-item" key={entry.id}>
                      <div className="history-item-header">
                        <span>
                          {entry.method} {entry.path}
                        </span>
                        <Badge bg={entry.ok ? "success" : "danger"}>
                          {entry.status || "ERR"}
                        </Badge>
                      </div>
                      <div className="history-item-meta">
                        <span>{entry.summary}</span>
                        <span>{entry.durationMs} ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state-text">
                  Start using the Admin sections and your latest calls will show
                  up here for the current environment.
                </p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AdminOverviewPage;
