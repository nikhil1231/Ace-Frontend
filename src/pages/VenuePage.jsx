import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Card,
  Col,
  Container,
  Form,
  ListGroup,
  Row,
  Spinner,
} from "react-bootstrap";

import {
  getBookingTargets,
  getBookings,
  getRecentlyUsedVenues,
  getVenueAddress,
  getVenueName,
  getVenues,
  getVenueSettings,
} from "../api";
import { fdate, fdatetime, minutesToTime } from "../util";

const normalizeVenues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((venue) => typeof venue === "string" && venue.trim().length > 0)
    .sort((first, second) => first.localeCompare(second));
};

const formatValue = (value) => {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
};

const formatSettingsTime = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "Not available";
  }

  return `${minutesToTime(parsed)} (${parsed} mins)`;
};

const SETTINGS_SUMMARY_FIELDS = [
  {
    label: "Advanced booking period",
    key: "AdvancedBookingPeriod",
    formatter: (value) => `${value} day(s)`,
  },
  {
    label: "New-day bookings open at",
    key: "NewDayBookingAvailabilityTime",
    formatter: formatSettingsTime,
  },
  {
    label: "Default interval",
    key: "DefaultInterval",
    formatter: (value) => `${value} mins`,
  },
  {
    label: "Maximum booking intervals",
    key: "MaximumBookingIntervals",
  },
  {
    label: "Payment enabled",
    key: "PaymentEnabled",
  },
  {
    label: "Membership required",
    key: "MembershipRequired",
  },
  {
    label: "Group booking enabled",
    key: "GroupBookingEnabled",
  },
  {
    label: "Admin-only bookings",
    key: "AdminOnlyBookings",
  },
];

const VenuePage = () => {
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState("");
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingVenueData, setIsLoadingVenueData] = useState(false);
  const [error, setError] = useState("");
  const [venueData, setVenueData] = useState({
    displayName: "",
    address: null,
    settings: null,
    isRecentlyUsed: false,
    venueBookings: [],
    bookingTargets: [],
    bookingsLastUpdated: null,
    partialErrors: [],
  });

  useEffect(() => {
    let isCancelled = false;

    const loadVenues = async () => {
      setIsLoadingVenues(true);
      try {
        const response = await getVenues();
        const normalized = normalizeVenues(response);

        if (isCancelled) {
          return;
        }

        setVenues(normalized);
        setSelectedVenue((currentValue) =>
          currentValue && normalized.includes(currentValue)
            ? currentValue
            : normalized[0] || ""
        );
        setError("");
      } catch (requestError) {
        if (!isCancelled) {
          setError(requestError.message || "Failed to load venues.");
          setVenues([]);
          setSelectedVenue("");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingVenues(false);
        }
      }
    };

    loadVenues();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedVenue) {
      setVenueData({
        displayName: "",
        address: null,
        settings: null,
        isRecentlyUsed: false,
        venueBookings: [],
        bookingTargets: [],
        bookingsLastUpdated: null,
        partialErrors: [],
      });
      return;
    }

    let isCancelled = false;

    const loadVenueData = async () => {
      setIsLoadingVenueData(true);
      setError("");

      const [
        venueNameResult,
        venueAddressResult,
        venueSettingsResult,
        recentlyUsedResult,
        bookingTargetsResult,
        bookingsResult,
      ] = await Promise.allSettled([
        getVenueName(selectedVenue),
        getVenueAddress(selectedVenue),
        getVenueSettings(selectedVenue),
        getRecentlyUsedVenues(),
        getBookingTargets(),
        getBookings(),
      ]);

      if (isCancelled) {
        return;
      }

      const partialErrors = [];

      const displayName =
        venueNameResult.status === "fulfilled"
          ? venueNameResult.value || ""
          : "";
      if (venueNameResult.status === "rejected") {
        partialErrors.push(
          venueNameResult.reason?.message || "Could not load venue name."
        );
      }

      const address =
        venueAddressResult.status === "fulfilled"
          ? venueAddressResult.value || null
          : null;
      if (venueAddressResult.status === "rejected") {
        partialErrors.push(
          venueAddressResult.reason?.message || "Could not load venue address."
        );
      }

      const settings =
        venueSettingsResult.status === "fulfilled"
          ? venueSettingsResult.value || null
          : null;
      if (venueSettingsResult.status === "rejected") {
        partialErrors.push(
          venueSettingsResult.reason?.message || "Could not load venue settings."
        );
      }

      const recentlyUsedVenues =
        recentlyUsedResult.status === "fulfilled" &&
        Array.isArray(recentlyUsedResult.value)
          ? recentlyUsedResult.value
          : [];
      if (recentlyUsedResult.status === "rejected") {
        partialErrors.push(
          recentlyUsedResult.reason?.message || "Could not load recently used venues."
        );
      }

      const allTargets =
        bookingTargetsResult.status === "fulfilled" &&
        Array.isArray(bookingTargetsResult.value)
          ? bookingTargetsResult.value
          : [];
      if (bookingTargetsResult.status === "rejected") {
        partialErrors.push(
          bookingTargetsResult.reason?.message || "Could not load booking targets."
        );
      }

      const bookingsPayload =
        bookingsResult.status === "fulfilled" && bookingsResult.value
          ? bookingsResult.value
          : {};
      if (bookingsResult.status === "rejected") {
        partialErrors.push(
          bookingsResult.reason?.message || "Could not load cached bookings."
        );
      }

      const allBookings = Array.isArray(bookingsPayload.bookings)
        ? bookingsPayload.bookings
        : [];

      setVenueData({
        displayName,
        address,
        settings,
        isRecentlyUsed: recentlyUsedVenues.includes(selectedVenue),
        venueBookings: allBookings
          .filter((booking) => booking?.Venue === selectedVenue)
          .sort((first, second) => {
            const dateComparison = String(first?.Date || "").localeCompare(
              String(second?.Date || "")
            );
            if (dateComparison !== 0) {
              return dateComparison;
            }
            return Number(first?.StartTime || 0) - Number(second?.StartTime || 0);
          }),
        bookingTargets: allTargets
          .filter((target) => target?.Venue === selectedVenue)
          .sort((first, second) => {
            const dateComparison = String(first?.Date || "").localeCompare(
              String(second?.Date || "")
            );
            if (dateComparison !== 0) {
              return dateComparison;
            }
            return Number(first?.StartTime || 0) - Number(second?.StartTime || 0);
          }),
        bookingsLastUpdated: bookingsPayload?.lastUpdated || null,
        partialErrors,
      });
      setIsLoadingVenueData(false);
    };

    loadVenueData().catch((requestError) => {
      if (!isCancelled) {
        setError(requestError.message || "Failed to load venue details.");
        setIsLoadingVenueData(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedVenue]);

  const venueSettingsSummary = useMemo(() => {
    if (!venueData.settings || typeof venueData.settings !== "object") {
      return [];
    }

    return SETTINGS_SUMMARY_FIELDS.map((field) => {
      const rawValue = venueData.settings[field.key];
      const value =
        typeof field.formatter === "function"
          ? field.formatter(rawValue)
          : formatValue(rawValue);

      return {
        key: field.key,
        label: field.label,
        value,
      };
    });
  }, [venueData.settings]);

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Venue</h1>
          <p className="page-subtitle">
            Inspect saved venue metadata, venue settings, and related booking
            information from the current backend cache.
          </p>
        </div>
      </div>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <Card className="surface-card mb-4">
        <Card.Body>
          <Card.Title>Select Venue</Card.Title>
          <Form.Group controlId="venue-page-select">
            <Form.Label>Venue</Form.Label>
            <Form.Select
              value={selectedVenue}
              onChange={(event) => setSelectedVenue(event.target.value)}
              disabled={isLoadingVenues}
            >
              {venues.length === 0 ? (
                <option value="">
                  {isLoadingVenues ? "Loading venues..." : "No venues found"}
                </option>
              ) : null}
              {venues.map((venue) => (
                <option key={venue} value={venue}>
                  {venue}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Card.Body>
      </Card>

      {isLoadingVenueData ? (
        <div className="text-center py-4">
          <Spinner animation="border" />
        </div>
      ) : null}

      {!isLoadingVenueData && selectedVenue ? (
        <>
          {venueData.partialErrors.length > 0 ? (
            <Alert variant="warning">
              {venueData.partialErrors.map((partialError, index) => (
                <div key={`${partialError}-${index}`}>{partialError}</div>
              ))}
            </Alert>
          ) : null}

          <Row className="g-3 mb-3">
            <Col lg={6}>
              <Card className="surface-card h-100">
                <Card.Body>
                  <Card.Title>Overview</Card.Title>
                  <ListGroup variant="flush">
                    <ListGroup.Item>
                      <strong>Slug</strong>
                      <br />
                      {selectedVenue}
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Name</strong>
                      <br />
                      {formatValue(venueData.displayName)}
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Recently used</strong>
                      <br />
                      <Badge bg={venueData.isRecentlyUsed ? "success" : "secondary"}>
                        {venueData.isRecentlyUsed ? "Yes" : "No"}
                      </Badge>
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Cached bookings</strong>
                      <br />
                      {venueData.venueBookings.length}
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Saved booking targets</strong>
                      <br />
                      {venueData.bookingTargets.length}
                    </ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Bookings cache updated</strong>
                      <br />
                      {venueData.bookingsLastUpdated
                        ? fdatetime(venueData.bookingsLastUpdated)
                        : "Not available"}
                    </ListGroup.Item>
                  </ListGroup>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={6}>
              <Card className="surface-card h-100">
                <Card.Body>
                  <Card.Title>Address</Card.Title>
                  {venueData.address ? (
                    <ListGroup variant="flush">
                      <ListGroup.Item>
                        <strong>Postcode</strong>
                        <br />
                        {formatValue(venueData.address.Postcode)}
                      </ListGroup.Item>
                      <ListGroup.Item>
                        <strong>Latitude</strong>
                        <br />
                        {formatValue(venueData.address.Latitude)}
                      </ListGroup.Item>
                      <ListGroup.Item>
                        <strong>Longitude</strong>
                        <br />
                        {formatValue(venueData.address.Longitude)}
                      </ListGroup.Item>
                    </ListGroup>
                  ) : (
                    <Alert variant="secondary" className="mb-0">
                      No saved address details for this venue.
                    </Alert>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Card className="surface-card mb-3">
            <Card.Body>
              <Card.Title>Settings</Card.Title>
              {venueSettingsSummary.length === 0 ? (
                <Alert variant="secondary" className="mb-0">
                  Venue settings were not returned.
                </Alert>
              ) : (
                <ListGroup variant="flush">
                  {venueSettingsSummary.map((field) => (
                    <ListGroup.Item key={field.key}>
                      <strong>{field.label}</strong>
                      <br />
                      {field.value}
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}

              {venueData.settings ? (
                <div className="response-panel">
                  <div className="response-panel-header">
                    <span className="endpoint-section-label mb-0">Raw settings JSON</span>
                  </div>
                  <pre>{JSON.stringify(venueData.settings, null, 2)}</pre>
                </div>
              ) : null}
            </Card.Body>
          </Card>

          <Card className="surface-card mb-3">
            <Card.Body>
              <Card.Title>Saved Booking Targets</Card.Title>
              {venueData.bookingTargets.length === 0 ? (
                <Alert variant="secondary" className="mb-0">
                  No booking targets are saved for this venue.
                </Alert>
              ) : (
                <div className="d-grid gap-2">
                  {venueData.bookingTargets.map((target, index) => (
                    <Card
                      key={`${target?.Date || "date"}-${target?.StartTime || 0}-${index}`}
                    >
                      <Card.Body>
                        <div className="d-flex flex-wrap justify-content-between gap-2">
                          <div>
                            <strong>{fdate(target?.Date)}</strong>
                            <div className="text-muted small">
                              {minutesToTime(target?.StartTime)} -{" "}
                              {minutesToTime(target?.EndTime)}
                            </div>
                          </div>
                          <div className="text-end">
                            <div>{target?.NumCourts || 1} court(s)</div>
                            <Badge
                              bg={target?.RecurringWeekly ? "info" : "secondary"}
                            >
                              {target?.RecurringWeekly ? "Recurring weekly" : "One-off"}
                            </Badge>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>

          <Card className="surface-card">
            <Card.Body>
              <Card.Title>Cached Bookings</Card.Title>
              {venueData.venueBookings.length === 0 ? (
                <Alert variant="secondary" className="mb-0">
                  No cached bookings are currently stored for this venue.
                </Alert>
              ) : (
                <div className="d-grid gap-2">
                  {venueData.venueBookings.map((booking, index) => (
                    <Card
                      key={`${booking?.SessionID || "session"}-${booking?.Date || "date"}-${index}`}
                    >
                      <Card.Body>
                        <div className="d-flex flex-wrap justify-content-between gap-2">
                          <div>
                            <strong>{fdate(booking?.Date)}</strong>
                            <div className="text-muted small">
                              Court {booking?.CourtNumber ?? "?"} -{" "}
                              {minutesToTime(booking?.StartTime)} to{" "}
                              {minutesToTime(booking?.EndTime)}
                            </div>
                          </div>
                          <div className="text-end">
                            <div>{booking?.Username || "Unknown user"}</div>
                            <div className="text-muted small">
                              Cancel by {fdatetime(booking?.CancelDeadline)}
                            </div>
                            <div className="text-muted small">
                              {typeof booking?.Cost === "number"
                                ? `\u00A3${booking.Cost.toFixed(2)}`
                                : "Price unavailable"}
                            </div>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </>
      ) : null}
    </Container>
  );
};

export default VenuePage;
