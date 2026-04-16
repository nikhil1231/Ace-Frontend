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

const SettingsPage = () => {
  const {
    backendUrl,
    clearToken,
    environments,
    hasAdminAccess,
    selectedEnvironment,
    setSelectedEnvironment,
    setToken,
    token,
  } = useAppSettings();
  const [draftToken, setDraftToken] = useState(token);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setDraftToken(token);
  }, [selectedEnvironment, token]);

  const redirectedFrom = location.state?.redirectTo;

  const handleSave = () => {
    setToken(draftToken);
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
