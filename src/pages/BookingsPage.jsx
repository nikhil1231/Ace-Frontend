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
  bookTargetNow,
  bookTargets,
  cancelBooking,
  cleanBookingTargets,
  deleteBookingTarget,
  findBookableSlots,
  getBookingTargets,
  getBookings,
  getVenues,
  putBookingTarget,
  refreshBookings,
} from "../api";
import { useAppSettings } from "../context/AppSettingsContext";
import { fdate, fdatetime, getToday, minutesToTime, timeToMinutes } from "../util";

const buildDefaultTargetFormValues = () => ({
  venue: "",
  date: getToday(),
  startTime: "18:00",
  endTime: "19:00",
  numCourts: "1",
  recurringWeekly: false,
});

const regroupBookings = (bookings) => {
  const sortedBookings = [...bookings].sort(
    (first, second) => new Date(first.Date) - new Date(second.Date)
  );
  const groupedBookings = {};

  sortedBookings.forEach((booking) => {
    if (!groupedBookings[booking.Date]) {
      groupedBookings[booking.Date] = [];
    }
    groupedBookings[booking.Date].push(booking);
  });

  return groupedBookings;
};

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

const formatPrice = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `\u00A3${amount.toFixed(2)}` : "Price unavailable";
};

const normalizeFindSlots = (payload) => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((slot) => slot && typeof slot === "object")
    .map((slot, index) => {
      const startTime = Number(slot.StartTime);
      const endTime = Number(slot.EndTime);
      const cost = Number(slot.Cost);
      const dateValue =
        typeof slot.Date === "string" && slot.Date.trim().length > 0
          ? slot.Date
          : "";
      const sessionId =
        typeof slot.SessionID === "string" && slot.SessionID.trim().length > 0
          ? slot.SessionID
          : `${dateValue}-${index}`;
      const courtNumber = Number(slot.CourtNumber);

      return {
        id: `${slot.Venue || "venue"}-${sessionId}-${index}`,
        venue: slot.VenueName || slot.Venue || "Unknown venue",
        name: slot.Name || "Court slot",
        date: dateValue,
        startTime: Number.isFinite(startTime) ? startTime : 0,
        endTime: Number.isFinite(endTime) ? endTime : 0,
        courtNumber: Number.isFinite(courtNumber) ? courtNumber : null,
        cost: Number.isFinite(cost) ? cost : null,
        bookingLink: slot.BookingLink || "",
      };
    })
    .sort((first, second) => {
      const dateComparison = first.date.localeCompare(second.date);

      if (dateComparison !== 0) {
        return dateComparison;
      }

      if (first.startTime !== second.startTime) {
        return first.startTime - second.startTime;
      }

      return first.venue.localeCompare(second.venue);
    });
};

const buildBookingTargetPayload = (formValues) => {
  const venue = formValues.venue.trim();

  if (!venue) {
    return { error: "Venue is required." };
  }

  if (!formValues.date) {
    return { error: "Date is required." };
  }

  const startTime = timeToMinutes(formValues.startTime);
  const endTime = timeToMinutes(formValues.endTime);

  if (startTime === "" || endTime === "") {
    return { error: "Start time and end time are required." };
  }

  if (startTime >= endTime) {
    return { error: "End time must be later than start time." };
  }

  const numCourts = Number.parseInt(formValues.numCourts, 10);

  if (!Number.isInteger(numCourts) || numCourts < 1) {
    return { error: "Courts must be an integer greater than or equal to 1." };
  }

  return {
    payload: {
      Venue: venue,
      Date: formValues.date,
      StartTime: startTime,
      EndTime: endTime,
      NumCourts: numCourts,
      RecurringWeekly: Boolean(formValues.recurringWeekly),
    },
  };
};

const BookingsPage = () => {
  const { hasAdminAccess } = useAppSettings();
  const [bookings, setBookings] = useState({});
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);
  const [bookingTargets, setBookingTargets] = useState([]);
  const [venues, setVenues] = useState([]);

  const [bookingsError, setBookingsError] = useState("");
  const [targetsError, setTargetsError] = useState("");
  const [venuesError, setVenuesError] = useState("");
  const [globalActionError, setGlobalActionError] = useState("");
  const [globalActionSuccess, setGlobalActionSuccess] = useState("");
  const [targetCrudError, setTargetCrudError] = useState("");
  const [targetCrudSuccess, setTargetCrudSuccess] = useState("");
  const [targetActionError, setTargetActionError] = useState("");
  const [targetActionSuccess, setTargetActionSuccess] = useState("");

  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isRefreshingBookings, setIsRefreshingBookings] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(true);
  const [isRefreshingTargets, setIsRefreshingTargets] = useState(false);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [deletingTargetKey, setDeletingTargetKey] = useState("");
  const [isRunningBookTargets, setIsRunningBookTargets] = useState(false);
  const [isCleaningTargets, setIsCleaningTargets] = useState(false);
  const [isBookingTargetNow, setIsBookingTargetNow] = useState(false);
  const [isFindingSlots, setIsFindingSlots] = useState(false);

  const [targetFormValues, setTargetFormValues] = useState(() =>
    buildDefaultTargetFormValues()
  );
  const [targetActionValues, setTargetActionValues] = useState(() =>
    buildDefaultTargetFormValues()
  );
  const [dryRun, setDryRun] = useState(true);
  const [findResultRaw, setFindResultRaw] = useState(null);
  const [findResultSlots, setFindResultSlots] = useState([]);

  const sortedTargets = useMemo(
    () => [...bookingTargets].sort(sortBookingTargets),
    [bookingTargets]
  );

  const loadBookings = useCallback(async ({ initial = false } = {}) => {
    if (initial) {
      setIsLoadingBookings(true);
    } else {
      setIsRefreshingBookings(true);
    }

    try {
      const data = await getBookings();
      setBookings(regroupBookings(Array.isArray(data?.bookings) ? data.bookings : []));
      setLastUpdatedTime(data?.lastUpdated || null);
      setBookingsError("");
    } catch (requestError) {
      setBookingsError(requestError.message || "Failed to load bookings.");
    } finally {
      if (initial) {
        setIsLoadingBookings(false);
      } else {
        setIsRefreshingBookings(false);
      }
    }
  }, []);

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

      setTargetFormValues((currentValue) => {
        if (currentValue.venue && normalizedVenues.includes(currentValue.venue)) {
          return currentValue;
        }
        return {
          ...currentValue,
          venue: normalizedVenues[0] || "",
        };
      });

      setTargetActionValues((currentValue) => {
        if (currentValue.venue && normalizedVenues.includes(currentValue.venue)) {
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
    loadBookings({ initial: true });
    loadBookingTargets({ initial: true });
    loadVenues();
  }, [loadBookings, loadBookingTargets, loadVenues]);

  const clearGlobalFeedback = () => {
    setGlobalActionError("");
    setGlobalActionSuccess("");
  };

  const handleTargetFormChange = (fieldName, value) => {
    setTargetFormValues((currentValue) => ({
      ...currentValue,
      [fieldName]: value,
    }));
  };

  const handleTargetActionFormChange = (fieldName, value) => {
    setTargetActionValues((currentValue) => ({
      ...currentValue,
      [fieldName]: value,
    }));
  };

  const handleRefreshBookings = async () => {
    clearGlobalFeedback();
    setBookingsError("");

    try {
      setIsRefreshingBookings(true);
      await refreshBookings();
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      await loadBookings();
      setGlobalActionSuccess("Bookings refreshed.");
    } catch (requestError) {
      setBookingsError(requestError.message || "Failed to refresh bookings.");
      setIsRefreshingBookings(false);
    }
  };

  const handleCancelBooking = async (booking) => {
    clearGlobalFeedback();
    setBookingsError("");

    try {
      await cancelBooking(booking.Venue, booking.SessionID, booking.Username);
      await loadBookings();
      setGlobalActionSuccess("Booking cancelled.");
    } catch (requestError) {
      setBookingsError(requestError.message || "Failed to cancel booking.");
    }
  };

  const resetTargetForm = () => {
    setTargetFormValues({
      ...buildDefaultTargetFormValues(),
      venue: venues[0] || "",
    });
    setTargetCrudError("");
    setTargetCrudSuccess("");
  };

  const handleAddTarget = async (event) => {
    event.preventDefault();
    setTargetCrudError("");
    setTargetCrudSuccess("");
    clearGlobalFeedback();

    const { payload, error } = buildBookingTargetPayload(targetFormValues);

    if (error) {
      setTargetCrudError(error);
      return;
    }

    try {
      setIsSavingTarget(true);
      await putBookingTarget(payload);
      setTargetCrudSuccess("Booking target added.");
      await loadBookingTargets();
    } catch (requestError) {
      setTargetCrudError(requestError.message || "Failed to add booking target.");
    } finally {
      setIsSavingTarget(false);
    }
  };

  const handleDeleteTarget = async (target) => {
    const targetKey = buildTargetKey(target);
    const targetDescription = `${target?.Venue || "Unknown venue"} ${target?.Date || ""} ${minutesToTime(
      target?.StartTime
    )}-${minutesToTime(target?.EndTime)}`.trim();

    if (!window.confirm(`Delete booking target: ${targetDescription}?`)) {
      return;
    }

    setTargetCrudError("");
    setTargetCrudSuccess("");
    clearGlobalFeedback();

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
      setTargetCrudSuccess("Booking target deleted.");
      await loadBookingTargets();
    } catch (requestError) {
      setTargetCrudError(requestError.message || "Failed to delete booking target.");
    } finally {
      setDeletingTargetKey("");
    }
  };

  const handleRunBookingTargets = async () => {
    if (
      !window.confirm(
        "Run booking across saved targets now? This can trigger live bookings."
      )
    ) {
      return;
    }

    clearGlobalFeedback();
    setBookingsError("");
    setTargetsError("");

    try {
      setIsRunningBookTargets(true);
      await bookTargets();
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      await Promise.all([loadBookings(), loadBookingTargets()]);
      setGlobalActionSuccess("Booking targets run completed.");
    } catch (requestError) {
      setGlobalActionError(
        requestError.message || "Failed to run booking targets."
      );
    } finally {
      setIsRunningBookTargets(false);
    }
  };

  const handleCleanTargets = async () => {
    if (
      !window.confirm(
        "Clean stale booking targets now? This removes outdated entries."
      )
    ) {
      return;
    }

    clearGlobalFeedback();
    setTargetsError("");

    try {
      setIsCleaningTargets(true);
      await cleanBookingTargets();
      await Promise.all([loadBookings(), loadBookingTargets()]);
      setGlobalActionSuccess("Stale targets cleaned.");
    } catch (requestError) {
      setGlobalActionError(requestError.message || "Failed to clean targets.");
    } finally {
      setIsCleaningTargets(false);
    }
  };

  const resetTargetActionForm = () => {
    setTargetActionValues({
      ...buildDefaultTargetFormValues(),
      venue: venues[0] || "",
    });
    setDryRun(true);
    setTargetActionError("");
    setTargetActionSuccess("");
    setFindResultRaw(null);
    setFindResultSlots([]);
  };

  const handleBookTargetNow = async () => {
    setTargetActionError("");
    setTargetActionSuccess("");
    clearGlobalFeedback();

    const { payload, error } = buildBookingTargetPayload(targetActionValues);

    if (error) {
      setTargetActionError(error);
      return;
    }

    try {
      setIsBookingTargetNow(true);
      await bookTargetNow(payload, { dryRun });
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      await Promise.all([loadBookings(), loadBookingTargets()]);
      setTargetActionSuccess(
        dryRun
          ? "Dry-run booking executed for the target."
          : "Live booking attempted for the target."
      );
    } catch (requestError) {
      setTargetActionError(
        requestError.message || "Failed to run target booking action."
      );
    } finally {
      setIsBookingTargetNow(false);
    }
  };

  const handleFindBookableSlots = async () => {
    setTargetActionError("");
    setTargetActionSuccess("");

    const { payload, error } = buildBookingTargetPayload(targetActionValues);

    if (error) {
      setTargetActionError(error);
      return;
    }

    try {
      setIsFindingSlots(true);
      const response = await findBookableSlots(payload);
      const slots = normalizeFindSlots(response);
      setFindResultRaw(response);
      setFindResultSlots(slots);
      setTargetActionSuccess(`Found ${slots.length} matching slot(s).`);
    } catch (requestError) {
      setTargetActionError(
        requestError.message || "Failed to find bookable slots."
      );
      setFindResultRaw(null);
      setFindResultSlots([]);
    } finally {
      setIsFindingSlots(false);
    }
  };

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Bookings</h1>
          <p className="page-subtitle">
            Manage bookings and booking targets from one place, including manual
            target actions and booking utilities.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button
            onClick={handleRefreshBookings}
            disabled={isRefreshingBookings || !hasAdminAccess}
          >
            {isRefreshingBookings ? "Refreshing..." : "Refresh bookings"}
          </Button>
          <Button
            variant="outline-dark"
            onClick={handleRunBookingTargets}
            disabled={isRunningBookTargets || !hasAdminAccess}
          >
            {isRunningBookTargets ? "Running..." : "Run booking targets"}
          </Button>
          <Button
            variant="outline-secondary"
            onClick={handleCleanTargets}
            disabled={isCleaningTargets || !hasAdminAccess}
          >
            {isCleaningTargets ? "Cleaning..." : "Clean stale targets"}
          </Button>
        </div>
      </div>

      {lastUpdatedTime ? (
        <p className="page-subtitle compact-subtitle">
          Last updated {fdatetime(lastUpdatedTime)}
        </p>
      ) : null}

      {!hasAdminAccess ? (
        <Alert variant="warning">
          Admin token is required for write actions. Finding bookable slots is
          available without a token.
        </Alert>
      ) : null}

      {globalActionError ? <Alert variant="danger">{globalActionError}</Alert> : null}
      {globalActionSuccess ? (
        <Alert variant="success">{globalActionSuccess}</Alert>
      ) : null}

      <Card className="surface-card mb-4">
        <Card.Body>
          <Card.Title>Bookings Cache</Card.Title>
          {bookingsError ? <Alert variant="danger">{bookingsError}</Alert> : null}
          {isLoadingBookings ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
            </div>
          ) : null}
          {!isLoadingBookings && Object.keys(bookings).length === 0 ? (
            <Alert variant="secondary">No cached bookings are available yet.</Alert>
          ) : null}
          {!isLoadingBookings
            ? Object.entries(bookings).map(([date, dateBookings]) => (
                <div key={date}>
                  <h4>{fdate(date)}</h4>
                  {dateBookings.map((booking, index) => (
                    <Card className="mb-3" key={`${date}-${booking.SessionID}-${index}`}>
                      <Card.Body>
                        <Card.Title>
                          {booking.Venue} - Court {booking.CourtNumber}
                        </Card.Title>
                        <ListGroup>
                          <ListGroup.Item>
                            Time: {minutesToTime(booking.StartTime)} -{" "}
                            {minutesToTime(booking.EndTime)}
                          </ListGroup.Item>
                          <ListGroup.Item>
                            Booking cost - {formatPrice(booking.Cost)}
                          </ListGroup.Item>
                          <ListGroup.Item>
                            Cancel deadline
                            <br />
                            {fdatetime(booking.CancelDeadline)}
                            <Button
                              style={{ float: "right" }}
                              variant="danger"
                              disabled={!hasAdminAccess}
                              onClick={() => handleCancelBooking(booking)}
                            >
                              Cancel
                            </Button>
                          </ListGroup.Item>
                        </ListGroup>
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              ))
            : null}
        </Card.Body>
      </Card>

      <Card className="surface-card mb-4">
        <Card.Body>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <Card.Title className="mb-0">Targets</Card.Title>
            <Button
              variant="outline-secondary"
              onClick={() => loadBookingTargets()}
              disabled={isLoadingTargets || isRefreshingTargets}
            >
              {isRefreshingTargets ? "Refreshing..." : "Refresh targets"}
            </Button>
          </div>

          {targetsError ? <Alert variant="danger">{targetsError}</Alert> : null}
          {venuesError ? <Alert variant="warning">{venuesError}</Alert> : null}
          {targetCrudError ? <Alert variant="danger">{targetCrudError}</Alert> : null}
          {targetCrudSuccess ? (
            <Alert variant="success">{targetCrudSuccess}</Alert>
          ) : null}

          <Form onSubmit={handleAddTarget}>
            <Row className="g-3">
              <Col md={4}>
                <Form.Group controlId="target-crud-venue-input">
                  <Form.Label>Venue</Form.Label>
                  {venues.length > 0 ? (
                    <Form.Select
                      value={targetFormValues.venue}
                      onChange={(event) =>
                        handleTargetFormChange("venue", event.target.value)
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
                      value={targetFormValues.venue}
                      placeholder={
                        isLoadingVenues ? "Loading venues..." : "Enter venue (slug)"
                      }
                      onChange={(event) =>
                        handleTargetFormChange("venue", event.target.value)
                      }
                      disabled={isLoadingVenues}
                      required
                    />
                  )}
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-crud-date-input">
                  <Form.Label>Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={targetFormValues.date}
                    onChange={(event) =>
                      handleTargetFormChange("date", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-crud-start-input">
                  <Form.Label>Start time</Form.Label>
                  <Form.Control
                    type="time"
                    step={1800}
                    value={targetFormValues.startTime}
                    onChange={(event) =>
                      handleTargetFormChange("startTime", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-crud-end-input">
                  <Form.Label>End time</Form.Label>
                  <Form.Control
                    type="time"
                    step={1800}
                    value={targetFormValues.endTime}
                    onChange={(event) =>
                      handleTargetFormChange("endTime", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-crud-courts-input">
                  <Form.Label>Courts</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    step={1}
                    value={targetFormValues.numCourts}
                    onChange={(event) =>
                      handleTargetFormChange("numCourts", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="target-crud-recurring-input" className="pt-2">
                  <Form.Check
                    type="switch"
                    label="Recurring weekly"
                    checked={targetFormValues.recurringWeekly}
                    onChange={(event) =>
                      handleTargetFormChange("recurringWeekly", event.target.checked)
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={8} className="d-flex flex-wrap justify-content-end gap-2">
                <Button variant="outline-secondary" onClick={resetTargetForm}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={!hasAdminAccess || isSavingTarget || isLoadingVenues}
                >
                  {isSavingTarget ? "Adding..." : "Add target"}
                </Button>
              </Col>
            </Row>
          </Form>

          {isLoadingTargets ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
            </div>
          ) : null}

          {!isLoadingTargets && sortedTargets.length === 0 ? (
            <Alert variant="secondary" className="mt-3 mb-0">
              No booking targets are scheduled yet.
            </Alert>
          ) : null}

          {!isLoadingTargets ? (
            <div className="mt-3">
              {sortedTargets.map((target, index) => {
                const targetKey = buildTargetKey(target);

                return (
                  <Card key={`${targetKey}-${index}`} className="mb-3">
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
                            onClick={() => handleDeleteTarget(target)}
                            disabled={
                              !hasAdminAccess ||
                              isSavingTarget ||
                              deletingTargetKey === targetKey
                            }
                          >
                            {deletingTargetKey === targetKey ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                      <ListGroup>
                        <ListGroup.Item>{fdate(target.Date)}</ListGroup.Item>
                        <ListGroup.Item>
                          {minutesToTime(target.StartTime)} -{" "}
                          {minutesToTime(target.EndTime)}
                        </ListGroup.Item>
                      </ListGroup>
                    </Card.Body>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </Card.Body>
      </Card>

      <Card className="surface-card mb-4">
        <Card.Body>
          <Card.Title>Target Actions</Card.Title>
          <p className="page-subtitle compact-subtitle">
            Use one target input to either find slots or run the target booking
            endpoint immediately.
          </p>

          {targetActionError ? <Alert variant="danger">{targetActionError}</Alert> : null}
          {targetActionSuccess ? (
            <Alert variant="success">{targetActionSuccess}</Alert>
          ) : null}

          <Form>
            <Row className="g-3">
              <Col md={4}>
                <Form.Group controlId="target-actions-venue-input">
                  <Form.Label>Venue</Form.Label>
                  {venues.length > 0 ? (
                    <Form.Select
                      value={targetActionValues.venue}
                      onChange={(event) =>
                        handleTargetActionFormChange("venue", event.target.value)
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
                      value={targetActionValues.venue}
                      placeholder={
                        isLoadingVenues ? "Loading venues..." : "Enter venue (slug)"
                      }
                      onChange={(event) =>
                        handleTargetActionFormChange("venue", event.target.value)
                      }
                      disabled={isLoadingVenues}
                      required
                    />
                  )}
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-actions-date-input">
                  <Form.Label>Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={targetActionValues.date}
                    onChange={(event) =>
                      handleTargetActionFormChange("date", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-actions-start-input">
                  <Form.Label>Start time</Form.Label>
                  <Form.Control
                    type="time"
                    step={1800}
                    value={targetActionValues.startTime}
                    onChange={(event) =>
                      handleTargetActionFormChange("startTime", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-actions-end-input">
                  <Form.Label>End time</Form.Label>
                  <Form.Control
                    type="time"
                    step={1800}
                    value={targetActionValues.endTime}
                    onChange={(event) =>
                      handleTargetActionFormChange("endTime", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group controlId="target-actions-courts-input">
                  <Form.Label>Courts</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    step={1}
                    value={targetActionValues.numCourts}
                    onChange={(event) =>
                      handleTargetActionFormChange("numCourts", event.target.value)
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="target-actions-recurring-input" className="pt-2">
                  <Form.Check
                    type="switch"
                    label="Recurring weekly"
                    checked={targetActionValues.recurringWeekly}
                    onChange={(event) =>
                      handleTargetActionFormChange(
                        "recurringWeekly",
                        event.target.checked
                      )
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="target-actions-dry-run-input" className="pt-2">
                  <Form.Check
                    type="switch"
                    label="Dry run (for Book target now)"
                    checked={dryRun}
                    onChange={(event) => setDryRun(event.target.checked)}
                  />
                </Form.Group>
              </Col>
              <Col md={4} className="d-flex flex-wrap justify-content-end gap-2">
                <Button variant="outline-secondary" onClick={resetTargetActionForm}>
                  Reset
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={handleFindBookableSlots}
                  disabled={isFindingSlots || isBookingTargetNow}
                >
                  {isFindingSlots ? "Finding..." : "Find bookable slots"}
                </Button>
                <Button
                  onClick={handleBookTargetNow}
                  disabled={!hasAdminAccess || isBookingTargetNow || isFindingSlots}
                >
                  {isBookingTargetNow ? "Running..." : "Book target now"}
                </Button>
              </Col>
            </Row>
          </Form>

          {findResultRaw !== null ? (
            <section className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>Find Results</strong>
                <Badge bg="secondary">{findResultSlots.length} slots</Badge>
              </div>

              {findResultSlots.length === 0 ? (
                <Alert variant="secondary" className="mb-3">
                  No bookable slots matched the target.
                </Alert>
              ) : (
                <div className="d-grid gap-2 mb-3">
                  {findResultSlots.map((slot) => (
                    <Card key={slot.id}>
                      <Card.Body>
                        <div className="d-flex justify-content-between flex-wrap gap-2">
                          <div>
                            <strong>{slot.venue}</strong>
                            <div className="text-muted small">
                              {slot.name}
                              {slot.courtNumber !== null
                                ? ` - Court ${slot.courtNumber}`
                                : ""}
                            </div>
                            <div className="text-muted small">{fdate(slot.date)}</div>
                          </div>
                          <div className="text-end">
                            <div>
                              {minutesToTime(slot.startTime)} -{" "}
                              {minutesToTime(slot.endTime)}
                            </div>
                            <div className="text-muted small">
                              {slot.cost === null ? "Price unavailable" : formatPrice(slot.cost)}
                            </div>
                          </div>
                        </div>
                        {slot.bookingLink ? (
                          <a
                            href={slot.bookingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="small"
                          >
                            Open booking page
                          </a>
                        ) : null}
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              )}

              <div className="response-panel">
                <div className="response-panel-header">
                  <span className="endpoint-section-label mb-0">Raw response</span>
                </div>
                <pre>{JSON.stringify(findResultRaw, null, 2)}</pre>
              </div>
            </section>
          ) : null}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default BookingsPage;
