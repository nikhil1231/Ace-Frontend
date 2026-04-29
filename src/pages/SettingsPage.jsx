import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  Col,
  Container,
  Form,
  Row,
} from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";

import { useAppSettings } from "../context/AppSettingsContext";

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const getHealthcheckUrl = (baseUrl) => `${normalizeBaseUrl(baseUrl)}/health`;

const checkBackendHealth = async (baseUrl, timeoutMs = 5000) => {
  const url = normalizeBaseUrl(baseUrl);
  if (!url) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getHealthcheckUrl(url), {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const SettingsPage = () => {
  const {
    backendUrl,
    backendUrls,
    clearToken,
    defaultBackendUrls,
    environments,
    hasAdminAccess,
    selectedEnvironment,
    setBackendUrls,
    setSelectedEnvironment,
    setToken,
    token,
  } = useAppSettings();
  const [draftToken, setDraftToken] = useState(token);
  const [draftBackendUrls, setDraftBackendUrls] = useState(backendUrls);
  const [healthStatuses, setHealthStatuses] = useState({
    local: null,
    hosted: null,
  });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setDraftToken(token);
  }, [selectedEnvironment, token]);

  useEffect(() => {
    setDraftBackendUrls(backendUrls);
  }, [backendUrls]);

  const redirectedFrom = location.state?.redirectTo;

  const handleSave = () => {
    setToken(draftToken);
  };

  const handleSaveBackendUrls = () => {
    setBackendUrls(draftBackendUrls);
    const nextHealthStatuses = {};

    setIsCheckingHealth(true);
    Promise.all(
      environments.map(async (environment) => {
        const configuredUrl =
          draftBackendUrls[environment.key] || defaultBackendUrls[environment.key];
        const isHealthy = await checkBackendHealth(configuredUrl);
        nextHealthStatuses[environment.key] = isHealthy;
      })
    )
      .then(() => {
        setHealthStatuses((previousValue) => ({
          ...previousValue,
          ...nextHealthStatuses,
        }));
      })
      .finally(() => setIsCheckingHealth(false));
  };

  const handleResetBackendUrls = () => {
    setDraftBackendUrls(defaultBackendUrls);
    setBackendUrls(defaultBackendUrls);
  };

  const handleBackendUrlChange = (environment, value) => {
    setDraftBackendUrls((previousValue) => ({
      ...previousValue,
      [environment]: value,
    }));
  };

  const handleClear = () => {
    setDraftToken("");
    clearToken();
  };

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">
            Pick which ACE backend to talk to and store the master token that
            unlocks the integrated Admin tools.
          </p>
        </div>
        <Badge bg={hasAdminAccess ? "dark" : "secondary"}>
          {hasAdminAccess ? "Admin unlocked" : "Admin locked"}
        </Badge>
      </div>

      {redirectedFrom ? (
        <Alert variant="warning">
          Admin access is locked right now. Save a master token to continue to{" "}
          <code>{redirectedFrom}</code>.
        </Alert>
      ) : null}

      <Row className="g-4">
        <Col lg={8}>
          <Card className="surface-card">
            <Card.Body>
              <Card.Title>Backend login</Card.Title>
              <Form>
                <Form.Group className="mb-4">
                  <Form.Label>Environment</Form.Label>
                  <div>
                    <ButtonGroup>
                      {environments.map((environment) => (
                        <Button
                          key={environment.key}
                          variant={
                            selectedEnvironment === environment.key
                              ? "primary"
                              : "outline-primary"
                          }
                          onClick={() =>
                            setSelectedEnvironment(environment.key)
                          }
                        >
                          {environment.label}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </div>
                  <Form.Text muted>
                    Requests will be sent to <code>{backendUrl}</code>.
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>Backend URLs</Form.Label>
                  <Row className="g-3">
                    {environments.map((environment) => (
                      <Col md={6} key={environment.key}>
                        <Form.Label className="small text-muted d-flex align-items-center gap-2">
                          {environment.label}
                          <span
                            className={`backend-health-dot ${
                              healthStatuses[environment.key] === null
                                ? "backend-health-unknown"
                                : healthStatuses[environment.key]
                                ? "backend-health-up"
                                : "backend-health-down"
                            }`}
                            title={
                              healthStatuses[environment.key] === null
                                ? "Health check not run yet."
                                : healthStatuses[environment.key]
                                ? "Service is reachable."
                                : "Service health check failed."
                            }
                          />
                        </Form.Label>
                        <Form.Control
                          type="url"
                          value={draftBackendUrls[environment.key] || ""}
                          onChange={(event) =>
                            handleBackendUrlChange(
                              environment.key,
                              event.target.value
                            )
                          }
                          placeholder={`Enter ${environment.label.toLowerCase()} backend URL`}
                        />
                      </Col>
                    ))}
                  </Row>
                  <Form.Text muted>
                    These URLs are saved in your browser only.
                  </Form.Text>
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="outline-primary"
                      onClick={handleSaveBackendUrls}
                      disabled={isCheckingHealth}
                    >
                      {isCheckingHealth
                        ? "Checking backend health..."
                        : "Save backend URLs"}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={handleResetBackendUrls}
                    >
                      Reset default URLs
                    </Button>
                  </div>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Master token</Form.Label>
                  <Form.Control
                    type="password"
                    value={draftToken}
                    onChange={(event) => setDraftToken(event.target.value)}
                    placeholder="Paste the backend master token"
                  />
                  <Form.Text muted>
                    ACE does not expose a safe validation endpoint, so the Admin
                    tab unlocks when a token is stored. Protected requests will
                    still be checked by the server.
                  </Form.Text>
                </Form.Group>

                <div className="d-flex flex-wrap gap-2">
                  <Button onClick={handleSave}>Save token</Button>
                  <Button variant="outline-secondary" onClick={handleClear}>
                    Clear token
                  </Button>
                  <Button
                    variant="outline-dark"
                    onClick={() => navigate("/admin")}
                    disabled={!hasAdminAccess}
                  >
                    Open Admin
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="surface-card h-100">
            <Card.Body>
              <Card.Title>Current status</Card.Title>
              <div className="settings-status-list">
                <div className="settings-status-item">
                  <span>Environment</span>
                  <strong>
                    {
                      environments.find(
                        (environment) => environment.key === selectedEnvironment
                      )?.label
                    }
                  </strong>
                </div>
                <div className="settings-status-item">
                  <span>Backend URL</span>
                  <code>{backendUrl}</code>
                </div>
                <div className="settings-status-item">
                  <span>Token stored</span>
                  <strong>{token ? "Yes" : "No"}</strong>
                </div>
                <div className="settings-status-item">
                  <span>Admin access</span>
                  <strong>{hasAdminAccess ? "Unlocked" : "Locked"}</strong>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default SettingsPage;
