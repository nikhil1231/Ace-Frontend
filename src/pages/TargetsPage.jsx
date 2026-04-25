import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  ListGroup,
  Row,
  Spinner,
} from "react-bootstrap";

import {
  deleteBookingTarget,
  getBookingTargets,
  getVenues,
  putBookingTarget,
} from "../api";
import { useAppSettings } from "../context/AppSettingsContext";
import { fdate, getToday, minutesToTime, timeToMinutes } from "../util";

const buildDefaultFormValues = () => ({
  venue: "",
  date: getToday(),
  startTime: "18:00",
  endTime: "19:00",
  numCourts: "1",
  recurringWeekly: false,
});

const normalizeVenues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((venue) => typeof venue === "string" && venue.trim().length > 0)
    .sort((first, second) => first.localeCompare(second));
};

const normalizeBookingTargets = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((target) => target && typeof target === "object");
};

const sortBookingTargets = (first, second) => {
  const dateComparison = String(first?.Date || "").localeCompare(
    String(second?.Date || "")
  );

  if (dateComparison !== 0) {
    return dateComparison;
  }

  const startTimeComparison =
    Number(first?.StartTime || 0) - Number(second?.StartTime || 0);

  if (startTimeComparison !== 0) {
    return startTimeComparison;
  }

  return String(first?.Venue || "").localeCompare(String(second?.Venue || ""));
};

const buildTargetKey = (target) =>
  [
    target?.Venue || "",
    target?.Date || "",
    String(target?.StartTime ?? ""),
    String(target?.EndTime ?? ""),
    String(target?.NumCourts ?? ""),
    String(Boolean(target?.RecurringWeekly)),
  ].join("|");

const TargetsPage = () => {
  const { hasAdminAccess } = useAppSettings();
  const [bookingTargets, setBookingTargets] = useState([]);
  const [venues, setVenues] = useState([]);

  const [targetsError, setTargetsError] = useState("");
  const [venuesError, setVenuesError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const [isLoadingTargets, setIsLoadingTargets] = useState(true);
  const [isRefreshingTargets, setIsRefreshingTargets] = useState(false);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [deletingTargetKey, setDeletingTargetKey] = useState("");

  const [formValues, setFormValues] = useState(() => buildDefaultFormValues());

  const sortedTargets = useMemo(
    () => [...bookingTargets].sort(sortBookingTargets),
    [bookingTargets]
  );

  const loadBookingTargets = useCallback(async ({ initial = false } = {}) => {
    if (initial) {
      setIsLoadingTargets(true);
    } else {
      setIsRefreshingTargets(true);
    }

    try {
      const targets = await getBookingTargets();
      setBookingTargets(normalizeBookingTargets(targets));
      setTargetsError("");
    } catch (requestError) {
      setTargetsError(requestError.message || "Failed to load booking targets.");
    } finally {
      if (initial) {
        setIsLoadingTargets(false);
      } else {
        setIsRefreshingTargets(false);
      }
    }
  }, []);

  const loadVenues = useCallback(async () => {
    setIsLoadingVenues(true);

    try {
      const response = await getVenues();
      const normalizedVenues = normalizeVenues(response);
      setVenues(normalizedVenues);
      setVenuesError("");
      setFormValues((currentValue) => {
        if (currentValue.venue && normalizedVenues.includes(currentValue.venue)) {
          return currentValue;
        }

        if (currentValue.venue && normalizedVenues.length === 0) {
          return currentValue;
        }

        return {
          ...currentValue,
          venue: normalizedVenues[0] || "",
        };
      });
    } catch (requestError) {
      setVenuesError(requestError.message || "Failed to load venues.");
    } finally {
      setIsLoadingVenues(false);
    }
  }, []);

  useEffect(() => {
    loadBookingTargets({ initial: true });
    loadVenues();
  }, [loadBookingTargets, loadVenues]);

  const handleFieldChange = (fieldName, value) => {
    setFormValues((currentValue) => ({
      ...currentValue,
      [fieldName]: value,
    }));
  };

  const resetForm = () => {
    setFormValues({
      ...buildDefaultFormValues(),
      venue: venues[0] || "",
    });
    setSubmitError("");
    setSubmitSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    const venue = formValues.venue.trim();

    if (!venue) {
      setSubmitError("Venue is required.");
      return;
    }

    if (!formValues.date) {
      setSubmitError("Date is required.");
      return;
    }

    const startTime = timeToMinutes(formValues.startTime);
    const endTime = timeToMinutes(formValues.endTime);

    if (startTime === "" || endTime === "") {
      setSubmitError("Start time and end time are required.");
      return;
    }

    if (startTime >= endTime) {
      setSubmitError("End time must be later than start time.");
      return;
    }

    const numCourts = Number.parseInt(formValues.numCourts, 10);

    if (!Number.isInteger(numCourts) || numCourts < 1) {
      setSubmitError("Courts must be an integer greater than or equal to 1.");
      return;
    }

    try {
      setIsSavingTarget(true);
      await putBookingTarget({
        Venue: venue,
        Date: formValues.date,
        StartTime: startTime,
        EndTime: endTime,
        NumCourts: numCourts,
        RecurringWeekly: Boolean(formValues.recurringWeekly),
      });
      setSubmitSuccess("Booking target added.");
      await loadBookingTargets();
    } catch (requestError) {
      setSubmitError(requestError.message || "Failed to add booking target.");
    } finally {
      setIsSavingTarget(false);
    }
  };

  const handleDelete = async (target) => {
    const targetKey = buildTargetKey(target);
    const targetDescription = `${target?.Venue || "Unknown venue"} ${target?.Date || ""} ${minutesToTime(
      target?.StartTime
    )}-${minutesToTime(target?.EndTime)}`.trim();

    if (!window.confirm(`Delete booking target: ${targetDescription}?`)) {
      return;
    }

    setSubmitError("");
    setSubmitSuccess("");

    try {
      setDeletingTargetKey(targetKey);
      await deleteBookingTarget({
        Venue: target?.Venue || "",
        Date: target?.Date || "",
        StartTime: Number(target?.StartTime || 0),
        EndTime: Number(target?.EndTime || 0),
        NumCourts: Number(target?.NumCourts || 1),
        RecurringWeekly: Boolean(target?.RecurringWeekly),
      });
      setSubmitSuccess("Booking target deleted.");
      await loadBookingTargets();
    } catch (requestError) {
      setSubmitError(requestError.message || "Failed to delete booking target.");
    } finally {
      setDeletingTargetKey("");
    }
  };

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Targets</h1>
          <p className="page-subtitle">
            Add new booking targets and inspect what is currently saved on the
            backend.
          </p>
        </div>
        <Button
          variant="outline-secondary"
          onClick={() => loadBookingTargets()}
          disabled={isLoadingTargets || isRefreshingTargets || isSavingTarget}
        >
          {isRefreshingTargets ? "Refreshing..." : "Refresh targets"}
        </Button>
      </div>

      {!hasAdminAccess ? (
        <Alert variant="warning">
          Adding targets requires the master token in Settings.
        </Alert>
      ) : null}

      {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
      {submitSuccess ? <Alert variant="success">{submitSuccess}</Alert> : null}
      {targetsError ? <Alert variant="danger">{targetsError}</Alert> : null}
      {venuesError ? (
        <Alert variant="warning" className="d-flex justify-content-between gap-3">
          <span>{venuesError}</span>
          <Button
            size="sm"
            variant="outline-dark"
            onClick={loadVenues}
            disabled={isLoadingVenues}
          >
            {isLoadingVenues ? "Loading..." : "Retry venues"}
          </Button>
        </Alert>
      ) : null}

      <Card className="surface-card mb-4">
        <Card.Body>
          <Card.Title>Add Booking Target</Card.Title>
          <Form onSubmit={handleSubmit}>
            <Row className="g-3">
              <Col md={4}>
                <Form.Group controlId="target-venue-input">
                  <Form.Label>Venue</Form.Label>
                  {venues.length > 0 ? (
                    <Form.Select
                      value={formValues.venue}
                      onChange={(event) =>
                        handleFieldChange("venue", event.target.value)
                      }
                      disabled={isLoadingVenues}
                      required
                    >
                      {venues.map((venue) => (
                        <option key={venue} value={venue}>
                          {venue}
                        </option>
                      ))}
                    </Form.Select>
                  ) : (
                    <Form.Control
                      type="text"
                      value={formValues.venue}
                      placeholder={
                        isLoadingVenues
                          ? "Loading venues..."
                          : "Enter venue (slug)"
                      }
                      onChange={(event) =>
                        handleFieldChange("venue", event.target.value)
                      }
                      disabled={isLoadingVenues}
                      required
                    />
                  )}
                  <Form.Text muted>
                    {venues.length > 0
                      ? "Loaded from saved venues."
                      : "No saved venues found, so a manual value is required."}
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-date-input">
                  <Form.Label>Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={formValues.date}
                    onChange={(event) => handleFieldChange("date", event.target.value)}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-start-time-input">
                  <Form.Label>Start time</Form.Label>
                  <Form.Control
                    type="time"
                    step={1800}
                    value={formValues.startTime}
                    onChange={(event) =>
                      handleFieldChange("startTime", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-end-time-input">
                  <Form.Label>End time</Form.Label>
                  <Form.Control
                    type="time"
                    step={1800}
                    value={formValues.endTime}
                    onChange={(event) =>
                      handleFieldChange("endTime", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-courts-input">
                  <Form.Label>Courts</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    step={1}
                    value={formValues.numCourts}
                    onChange={(event) =>
                      handleFieldChange("numCourts", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="target-recurring-input" className="pt-2">
                  <Form.Check
                    type="switch"
                    label="Recurring weekly"
                    checked={formValues.recurringWeekly}
                    onChange={(event) =>
                      handleFieldChange("recurringWeekly", event.target.checked)
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={8} className="d-flex flex-wrap justify-content-end gap-2">
                <Button variant="outline-secondary" onClick={resetForm}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingTarget || !hasAdminAccess || isLoadingVenues}
                >
                  {isSavingTarget ? "Adding..." : "Add target"}
                </Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      {isLoadingTargets ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : null}

      {!isLoadingTargets && sortedTargets.length === 0 ? (
        <Alert variant="secondary">No booking targets are scheduled yet.</Alert>
      ) : null}

      {!isLoadingTargets
        ? sortedTargets.map((target, index) => (
            <Card
              key={`${target.Venue}-${target.Date}-${target.StartTime}-${target.EndTime}-${index}`}
              className="mb-3"
            >
              <Card.Body>
                <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                  <Card.Title className="mb-0">
                    {target.Venue} ({target.NumCourts || 1}{" "}
                    {(target.NumCourts || 1) === 1 ? "Court" : "Courts"})
                  </Card.Title>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <Badge bg={target.RecurringWeekly ? "info" : "secondary"}>
                      {target.RecurringWeekly ? "Recurring weekly" : "One-off"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => handleDelete(target)}
                      disabled={
                        !hasAdminAccess ||
                        isSavingTarget ||
                        deletingTargetKey === buildTargetKey(target)
                      }
                    >
                      {deletingTargetKey === buildTargetKey(target)
                        ? "Deleting..."
                        : "Delete"}
                    </Button>
                  </div>
                </div>
                <ListGroup>
                  <ListGroup.Item>{fdate(target.Date)}</ListGroup.Item>
                  <ListGroup.Item>
                    {minutesToTime(target.StartTime)} - {minutesToTime(target.EndTime)}
                  </ListGroup.Item>
                </ListGroup>
              </Card.Body>
            </Card>
          ))
        : null}
    </Container>
  );
};

export default TargetsPage;
