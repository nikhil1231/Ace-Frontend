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

import { checkAdminAuth } from "../api";
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
  const [tokenCheck, setTokenCheck] = useState({
    status: "idle",
    message: "",
  });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setDraftToken(token);
    setTokenCheck({
      status: token ? "idle" : "empty",
      message: token ? "" : "No token stored for this environment.",
    });
  }, [selectedEnvironment, token]);

  useEffect(() => {
    setDraftBackendUrls(backendUrls);
  }, [backendUrls]);

  const redirectedFrom = location.state?.redirectTo;

  const handleSave = async () => {
    const tokenValue = draftToken.trim();
    setToken(draftToken);

    if (!tokenValue) {
      setTokenCheck({
        status: "empty",
        message: "No token stored for this environment.",
      });
      return;
    }

    setTokenCheck({
      status: "checking",
      message: "Checking token against the selected backend...",
    });

    try {
      await checkAdminAuth({ environment: selectedEnvironment });
      setTokenCheck({
        status: "valid",
        message: "Token accepted by the selected backend.",
      });
    } catch (error) {
      setTokenCheck({
        status: "invalid",
        message:
          error.message ||
          "The selected backend rejected this token. Check the environment and token value.",
      });
    }
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
    setTokenCheck({
      status: "empty",
      message: "No token stored for this environment.",
    });
  };

  const tokenCheckBadge = {
    checking: "warning",
    valid: "success",
    invalid: "danger",
    empty: "secondary",
    idle: "secondary",
  }[tokenCheck.status];

  const tokenCheckLabel = {
    checking: "Checking",
    valid: "Valid",
    invalid: "Invalid",
    empty: "No token",
    idle: "Unchecked",
  }[tokenCheck.status];

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
                    Token checks run against the selected backend and
                    environment.
                  </Form.Text>
                  {tokenCheck.message ? (
                    <Alert
                      variant={
                        tokenCheck.status === "valid"
                          ? "success"
                          : tokenCheck.status === "invalid"
                          ? "danger"
                          : "secondary"
                      }
                      className="mt-3 mb-0"
                    >
                      {tokenCheck.message}
                    </Alert>
                  ) : null}
                </Form.Group>

                <div className="d-flex flex-wrap gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={tokenCheck.status === "checking"}
                  >
                    {tokenCheck.status === "checking"
                      ? "Checking token..."
                      : "Save and check token"}
                  </Button>
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
                  <span>Token check</span>
                  <Badge bg={tokenCheckBadge}>{tokenCheckLabel}</Badge>
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
