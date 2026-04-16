import React, { useEffect, useState } from "react";
import {
  Badge,
  Button,
  ButtonGroup,
  Card,
  Col,
  Form,
  Row,
} from "react-bootstrap";

import { requestApi } from "../../api";
import {
  buildInitialValues,
  buildRequestFromDescriptor,
  getValueAtPath,
  setValueAtPath,
} from "../../admin/runtime";
import { useAppSettings } from "../../context/AppSettingsContext";
import {
  deepClone,
  deleteEndpointPreset,
  getEndpointPresets,
  getRequestHistory,
  minutesToTime,
  pushRequestHistory,
  saveEndpointPreset,
  subscribeToAdminDataChange,
  timeToMinutes,
} from "../../util";

const summarizeRequest = (request) => {
  const queryKeys = Object.keys(request.query || {});
  const bodyKeys =
    request.body && typeof request.body === "object"
      ? Object.keys(request.body)
      : [];

  if (queryKeys.length === 0 && bodyKeys.length === 0) {
    return "No inputs";
  }

  if (queryKeys.length > 0 && bodyKeys.length === 0) {
    return `Query: ${queryKeys.join(", ")}`;
  }

  if (bodyKeys.length > 0 && queryKeys.length === 0) {
    return `Body: ${bodyKeys.join(", ")}`;
  }

  return `Query: ${queryKeys.join(", ")} | Body: ${bodyKeys.join(", ")}`;
};

const getActionVariant = (endpoint) => {
  if (endpoint.method === "DELETE") {
    return "danger";
  }

  if (endpoint.requiresAuth) {
    return "dark";
  }

  return "primary";
};

const renderJson = (value) => JSON.stringify(value, null, 2);

const Field = ({ endpoint, field, formValues, setFormValues }) => {
  const value = getValueAtPath(formValues, field.path);
  const controlId = `${endpoint.id}-${field.path.replaceAll(".", "-")}`;

  if (field.type === "checkbox") {
    return (
      <Col md={field.colMd || 6} className="mb-3">
        <Form.Group controlId={controlId} className="admin-checkbox-field">
          <Form.Check
            type="switch"
            label={field.label}
            checked={Boolean(value)}
            onChange={(event) =>
              setFormValues((currentValue) =>
                setValueAtPath(currentValue, field.path, event.target.checked)
              )
            }
          />
          {field.helperText ? (
            <Form.Text muted>{field.helperText}</Form.Text>
          ) : null}
        </Form.Group>
      </Col>
    );
  }

  const inputType =
    field.type === "minutes-time"
      ? "time"
      : field.type === "textarea" || field.type === "select"
      ? undefined
      : field.type;

  const inputValue =
    field.type === "minutes-time" ? minutesToTime(value) || "" : value ?? "";

  const handleChange = (event) => {
    const nextValue =
      field.type === "minutes-time"
        ? timeToMinutes(event.target.value)
        : event.target.value;

    setFormValues((currentValue) =>
      setValueAtPath(currentValue, field.path, nextValue)
    );
  };

  return (
    <Col md={field.colMd || 6} className="mb-3">
      <Form.Group controlId={controlId}>
        <Form.Label>{field.label}</Form.Label>
        {field.type === "textarea" ? (
          <Form.Control
            as="textarea"
            rows={field.rows || 4}
            value={inputValue}
            placeholder={field.placeholder}
            onChange={handleChange}
          />
        ) : null}
        {field.type === "select" ? (
          <Form.Select value={inputValue} onChange={handleChange}>
            <option value="">Choose...</option>
            {(field.enum || []).map((optionValue) => (
              <option key={String(optionValue)} value={String(optionValue)}>
                {String(optionValue)}
              </option>
            ))}
          </Form.Select>
        ) : null}
        {field.type !== "textarea" && field.type !== "select" ? (
          <Form.Control
            type={inputType}
            value={inputValue}
            placeholder={field.placeholder}
            onChange={handleChange}
            required={field.required}
            min={field.min}
            step={field.step}
          />
        ) : null}
        {field.helperText ? (
          <Form.Text muted>{field.helperText}</Form.Text>
        ) : null}
      </Form.Group>
    </Col>
  );
};

const EndpointCard = ({ endpoint }) => {
  const { hasAdminAccess, selectedEnvironment } = useAppSettings();
  const [formValues, setFormValues] = useState(() => buildInitialValues(endpoint));
  const [response, setResponse] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setDataVersion] = useState(0);

  useEffect(() => {
    setFormValues(buildInitialValues(endpoint));
  }, [endpoint]);

  useEffect(() => {
    return subscribeToAdminDataChange(() => {
      setDataVersion((currentValue) => currentValue + 1);
    });
  }, []);

  const presets = getEndpointPresets(endpoint.id, selectedEnvironment);
  const recentHistory = getRequestHistory(selectedEnvironment)
    .filter((entry) => entry.endpointId === endpoint.id)
    .slice(0, 3);

  const handleSubmit = async () => {
    let request;
    const requiresConfirmation = endpoint.confirm ?? endpoint.method !== "GET";

    if (endpoint.requiresAuth && !hasAdminAccess) {
      setResponse({
        ok: false,
        status: 0,
        error: "Store a master token in Settings before running this endpoint.",
        durationMs: 0,
        payload: null,
        url: endpoint.path,
      });
      return;
    }

    try {
      request = buildRequestFromDescriptor(endpoint, formValues);
    } catch (error) {
      setResponse({
        ok: false,
        status: 0,
        error: error.message || "Could not build request payload.",
        durationMs: 0,
        payload: null,
        url: endpoint.path,
      });
      return;
    }

    if (
      requiresConfirmation &&
      !window.confirm(
        `Run ${endpoint.method} ${endpoint.path}? Confirm this write action before the request is sent.`
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    const result = await requestApi({
      method: endpoint.method,
      path: endpoint.path,
      query: request.query,
      body: request.body,
      requiresAuth: endpoint.requiresAuth,
    });
    setResponse(result);
    pushRequestHistory({
      id: `${endpoint.id}-${Date.now()}`,
      endpointId: endpoint.id,
      title: endpoint.title,
      method: endpoint.method,
      path: endpoint.path,
      status: result.status,
      ok: result.ok,
      durationMs: result.durationMs,
      requestedAt: new Date().toISOString(),
      summary: summarizeRequest(request),
    });
    setIsSubmitting(false);
  };

  const handleReset = () => {
    setFormValues(buildInitialValues(endpoint));
    setResponse(null);
  };

  const handleSavePreset = () => {
    const name = window.prompt(
      `Save a preset for ${endpoint.title}`,
      `${endpoint.title} preset`
    );

    if (!name) {
      return;
    }

    saveEndpointPreset(endpoint.id, name, formValues, selectedEnvironment);
    setDataVersion((currentValue) => currentValue + 1);
  };

  const handleLoadPreset = (preset) => {
    setFormValues(deepClone(preset.values));
  };

  const handleDeletePreset = (presetId) => {
    deleteEndpointPreset(endpoint.id, presetId, selectedEnvironment);
    setDataVersion((currentValue) => currentValue + 1);
  };

  return (
    <Card className="surface-card endpoint-card h-100">
      <Card.Body>
        <div className="endpoint-card-header">
          <div>
            <Card.Title>{endpoint.title}</Card.Title>
            <p className="endpoint-description">{endpoint.description}</p>
          </div>
          <div className="endpoint-badges">
            <Badge bg={endpoint.method === "GET" ? "success" : "dark"}>
              {endpoint.method}
            </Badge>
            <Badge bg={endpoint.requiresAuth ? "warning" : "secondary"}>
              {endpoint.requiresAuth ? "Token required" : "Public"}
            </Badge>
          </div>
        </div>

        <div className="endpoint-path">
          <code>{endpoint.path}</code>
        </div>

        <Form className="mt-3">
          <Row>
            {endpoint.fields.length > 0 ? (
              endpoint.fields.map((field) => (
                <Field
                  key={`${endpoint.id}-${field.path}`}
                  endpoint={endpoint}
                  field={field}
                  formValues={formValues}
                  setFormValues={setFormValues}
                />
              ))
            ) : (
              <Col>
                <p className="empty-state-text">
                  This endpoint does not require any input.
                </p>
              </Col>
            )}
          </Row>
        </Form>

        <div className="endpoint-actions">
          <div className="endpoint-primary-actions">
            <Button
              variant={getActionVariant(endpoint)}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Running..." : `Run ${endpoint.method}`}
            </Button>
            <Button variant="outline-secondary" onClick={handleReset}>
              Reset
            </Button>
            <Button
              variant="outline-primary"
              onClick={handleSavePreset}
              disabled={endpoint.fields.length === 0}
            >
              Save preset
            </Button>
          </div>
          {endpoint.requiresAuth && !hasAdminAccess ? (
            <p className="auth-warning-text">
              Save a master token in Settings to unlock this endpoint.
            </p>
          ) : null}
        </div>

        {presets.length > 0 ? (
          <div className="endpoint-presets">
            <span className="endpoint-section-label">Presets</span>
            <div className="preset-list">
              {presets.map((preset) => (
                <ButtonGroup key={preset.id} size="sm">
                  <Button
                    variant="outline-dark"
                    onClick={() => handleLoadPreset(preset)}
                  >
                    {preset.name}
                  </Button>
                  <Button
                    variant="outline-danger"
                    onClick={() => handleDeletePreset(preset.id)}
                  >
                    Remove
                  </Button>
                </ButtonGroup>
              ))}
            </div>
          </div>
        ) : null}

        <div className="response-panel">
          <div className="response-panel-header">
            <span className="endpoint-section-label">Latest response</span>
            {response ? (
              <div className="response-metadata">
                <Badge bg={response.ok ? "success" : "danger"}>
                  {response.status || "ERR"}
                </Badge>
                <span>{response.durationMs} ms</span>
              </div>
            ) : null}
          </div>

          {response ? (
            <>
              {!response.ok ? (
                <p className="response-error-text">{response.error}</p>
              ) : null}
              <pre>{renderJson(response.payload)}</pre>
            </>
          ) : (
            <p className="empty-state-text">
              Run the endpoint to inspect the response here.
            </p>
          )}
        </div>

        {recentHistory.length > 0 ? (
          <div className="history-panel">
            <span className="endpoint-section-label">Recent calls</span>
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
          </div>
        ) : null}
      </Card.Body>
    </Card>
  );
};

export default EndpointCard;
