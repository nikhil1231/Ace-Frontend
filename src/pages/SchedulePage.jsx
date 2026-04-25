import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
} from "react-bootstrap";

import { getSchedule, getVenues } from "../api";
import { getToday, minutesToTime } from "../util";

const MIN_N_DAYS = 1;
const DEFAULT_N_DAYS = 7;
const TIME_MARK_INTERVAL = 30;
const PIXELS_PER_MINUTE = 1.2;
const FALLBACK_DAY_START = 7 * 60;
const FALLBACK_DAY_END = 22 * 60;
const SCHEDULE_SEARCH_STORAGE_KEY = "ACE_SCHEDULE_SEARCH_V1";
const MAX_RECENT_VENUES = 3;

const DEFAULT_SEARCH_STATE = {
  selectedVenue: "",
  queryMode: "date",
  selectedDate: getToday(),
  nDays: String(DEFAULT_N_DAYS),
  recentVenues: [],
};

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const sanitizeDateValue = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return getToday();
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getToday();
};

const sanitizeNDaysValue = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < MIN_N_DAYS) {
    return String(DEFAULT_N_DAYS);
  }

  return String(parsed);
};

const sanitizeRecentVenues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueVenues = [];
  value.forEach((venue) => {
    if (
      typeof venue === "string" &&
      venue.trim().length > 0 &&
      !uniqueVenues.includes(venue)
    ) {
      uniqueVenues.push(venue);
    }
  });

  return uniqueVenues.slice(0, MAX_RECENT_VENUES);
};

const readPersistedSearchState = () => {
  if (!canUseStorage()) {
    return { ...DEFAULT_SEARCH_STATE };
  }

  try {
    const rawValue = window.localStorage.getItem(SCHEDULE_SEARCH_STORAGE_KEY);
    if (!rawValue) {
      return { ...DEFAULT_SEARCH_STATE };
    }

    const parsed = JSON.parse(rawValue);
    const selectedVenue =
      typeof parsed?.selectedVenue === "string" ? parsed.selectedVenue : "";

    return {
      selectedVenue,
      queryMode: parsed?.queryMode === "n_days" ? "n_days" : "date",
      selectedDate: sanitizeDateValue(parsed?.selectedDate),
      nDays: sanitizeNDaysValue(parsed?.nDays),
      recentVenues: sanitizeRecentVenues(parsed?.recentVenues),
    };
  } catch (error) {
    return { ...DEFAULT_SEARCH_STATE };
  }
};

const persistSearchState = (nextState) => {
  if (!canUseStorage()) {
    return;
  }

  const payload = {
    selectedVenue:
      typeof nextState?.selectedVenue === "string" ? nextState.selectedVenue : "",
    queryMode: nextState?.queryMode === "n_days" ? "n_days" : "date",
    selectedDate: sanitizeDateValue(nextState?.selectedDate),
    nDays: sanitizeNDaysValue(nextState?.nDays),
    recentVenues: sanitizeRecentVenues(nextState?.recentVenues),
  };

  try {
    window.localStorage.setItem(
      SCHEDULE_SEARCH_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (error) {
    // Ignore storage write errors, page remains functional without persistence.
  }
};

const updateRecentVenues = (currentRecentVenues, nextVenue) => {
  if (typeof nextVenue !== "string" || nextVenue.trim().length === 0) {
    return sanitizeRecentVenues(currentRecentVenues);
  }

  return [
    nextVenue,
    ...sanitizeRecentVenues(currentRecentVenues).filter(
      (venue) => venue !== nextVenue
    ),
  ].slice(0, MAX_RECENT_VENUES);
};

const normalizeDateKey = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.split("T")[0];
};

const parseDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDayHeading = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) {
    return dateKey;
  }

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const resolveSessionCost = (session) => {
  const candidates = [
    session?.Cost,
    session?.CourtCost,
    session?.CostFrom,
    session?.MemberPrice,
    session?.GuestPrice,
  ];

  return candidates.find(
    (value) => typeof value === "number" && Number.isFinite(value)
  );
};

const formatCurrency = (amount) => {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "Available";
  }

  return `\u00A3${amount.toFixed(2)}`;
};

const sortCourts = (first, second) => {
  const firstNumber =
    typeof first?.Number === "number" && Number.isFinite(first.Number)
      ? first.Number
      : Number.MAX_SAFE_INTEGER;
  const secondNumber =
    typeof second?.Number === "number" && Number.isFinite(second.Number)
      ? second.Number
      : Number.MAX_SAFE_INTEGER;

  if (firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return (first?.Name || "").localeCompare(second?.Name || "");
};

const buildTimelineDays = (schedule) => {
  if (!schedule || !Array.isArray(schedule.Courts)) {
    return [];
  }

  const sortedCourts = [...schedule.Courts].sort(sortCourts);
  const allDayKeys = new Set();

  const normalizedCourts = sortedCourts.map((court, index) => {
    const dayMap = new Map();
    (court.Days || []).forEach((day) => {
      const dateKey = normalizeDateKey(day?.Date);
      if (!dateKey) {
        return;
      }

      allDayKeys.add(dateKey);
      dayMap.set(dateKey, day);
    });

    const fallbackNumber =
      typeof court?.Number === "number" && Number.isFinite(court.Number)
        ? court.Number + 1
        : index + 1;
    const courtName = court?.Name || `Court ${fallbackNumber}`;
    const courtId = court?.ID || `${courtName}-${fallbackNumber}`;

    return {
      id: courtId,
      name: courtName,
      dayMap,
    };
  });

  return [...allDayKeys].sort().map((dateKey) => ({
    dateKey,
    courts: normalizedCourts.map((court) => {
      const courtDay = court.dayMap.get(dateKey);
      const sessions = (courtDay?.Sessions || [])
        .map((session, sessionIndex) => ({
          id: session?.ID || `${court.id}-${dateKey}-${sessionIndex}`,
          startTime: Number(session?.StartTime) || 0,
          endTime: Number(session?.EndTime) || 0,
          available: Number(session?.Capacity) > 0,
          price: resolveSessionCost(session),
        }))
        .filter((session) => session.endTime > session.startTime)
        .sort(
          (first, second) =>
            first.startTime - second.startTime || first.endTime - second.endTime
        );

      return {
        id: court.id,
        name: court.name,
        sessions,
      };
    }),
  }));
};

const buildTimeMarks = (startTime, endTime) => {
  const marks = [];
  for (let minute = startTime; minute <= endTime; minute += TIME_MARK_INTERVAL) {
    marks.push(minute);
  }
  return marks;
};

const SchedulePage = () => {
  const persistedSearchState = useMemo(() => readPersistedSearchState(), []);
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(
    persistedSearchState.selectedVenue
  );
  const [queryMode, setQueryMode] = useState(persistedSearchState.queryMode);
  const [selectedDate, setSelectedDate] = useState(
    persistedSearchState.selectedDate
  );
  const [nDays, setNDays] = useState(persistedSearchState.nDays);
  const [recentVenues, setRecentVenues] = useState(
    persistedSearchState.recentVenues
  );
  const [scheduleData, setScheduleData] = useState(null);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadVenues = async () => {
      try {
        const venueResponse = await getVenues();
        const normalizedVenues = Array.isArray(venueResponse)
          ? venueResponse.filter(
              (venue) => typeof venue === "string" && venue.trim().length > 0
            )
          : [];

        if (isCancelled) {
          return;
        }

        setVenues(normalizedVenues);
        setSelectedVenue((currentVenue) =>
          currentVenue && normalizedVenues.includes(currentVenue)
            ? currentVenue
            : normalizedVenues[0] || ""
        );
        setRecentVenues((currentRecentVenues) =>
          currentRecentVenues
            .filter((venue) => normalizedVenues.includes(venue))
            .slice(0, MAX_RECENT_VENUES)
        );
      } catch (requestError) {
        if (!isCancelled) {
          setError(requestError.message || "Failed to load venues.");
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

  const timelineDays = useMemo(() => buildTimelineDays(scheduleData), [scheduleData]);
  const currentDay = timelineDays[currentDayIndex] || null;

  const sessionBounds = useMemo(() => {
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;

    timelineDays.forEach((day) => {
      day.courts.forEach((court) => {
        court.sessions.forEach((session) => {
          if (session.startTime < minStart) {
            minStart = session.startTime;
          }
          if (session.endTime > maxEnd) {
            maxEnd = session.endTime;
          }
        });
      });
    });

    return {
      minStart: Number.isFinite(minStart) ? minStart : null,
      maxEnd: Number.isFinite(maxEnd) ? maxEnd : null,
    };
  }, [timelineDays]);

  const windowStart = useMemo(() => {
    const candidate =
      typeof scheduleData?.EarliestStartTime === "number" &&
      Number.isFinite(scheduleData.EarliestStartTime)
        ? scheduleData.EarliestStartTime
        : sessionBounds.minStart ?? FALLBACK_DAY_START;

    return Math.floor(candidate / TIME_MARK_INTERVAL) * TIME_MARK_INTERVAL;
  }, [scheduleData, sessionBounds.minStart]);

  const windowEnd = useMemo(() => {
    const candidate =
      typeof scheduleData?.LatestEndTime === "number" &&
      Number.isFinite(scheduleData.LatestEndTime)
        ? scheduleData.LatestEndTime
        : sessionBounds.maxEnd ?? FALLBACK_DAY_END;

    const rounded = Math.ceil(candidate / TIME_MARK_INTERVAL) * TIME_MARK_INTERVAL;
    return Math.max(rounded, windowStart + TIME_MARK_INTERVAL);
  }, [scheduleData, sessionBounds.maxEnd, windowStart]);

  const timeMarks = useMemo(() => buildTimeMarks(windowStart, windowEnd), [
    windowStart,
    windowEnd,
  ]);

  const dayHeight = Math.max(
    (windowEnd - windowStart) * PIXELS_PER_MINUTE,
    TIME_MARK_INTERVAL * PIXELS_PER_MINUTE * 2
  );

  const timelineColumns = currentDay?.courts?.length || 1;
  const timelineGridStyle = {
    gridTemplateColumns: `80px repeat(${timelineColumns}, minmax(180px, 1fr))`,
  };

  const recentVenuePills = useMemo(
    () => recentVenues.filter((venue) => venues.includes(venue)),
    [recentVenues, venues]
  );

  const handleScheduleRequest = async (event) => {
    event.preventDefault();

    if (!selectedVenue) {
      setError("Please select a venue before requesting the schedule.");
      return;
    }

    if (queryMode === "date" && !selectedDate) {
      setError("Please select a date.");
      return;
    }

    const parsedNDays = Number.parseInt(nDays, 10);
    if (
      queryMode === "n_days" &&
      (!Number.isInteger(parsedNDays) || parsedNDays < MIN_N_DAYS)
    ) {
      setError(
        `Please enter n_days as an integer greater than or equal to ${MIN_N_DAYS}.`
      );
      return;
    }

    setIsLoadingSchedule(true);
    setError("");

    try {
      const nextSchedule = await getSchedule({
        venue: selectedVenue,
        date: queryMode === "date" ? selectedDate : undefined,
        nDays: queryMode === "n_days" ? parsedNDays : undefined,
      });

      const nextRecentVenues = updateRecentVenues(recentVenues, selectedVenue);
      setScheduleData(nextSchedule);
      setCurrentDayIndex(0);
      setRecentVenues(nextRecentVenues);
      persistSearchState({
        selectedVenue,
        queryMode,
        selectedDate,
        nDays: queryMode === "n_days" ? String(parsedNDays) : nDays,
        recentVenues: nextRecentVenues,
      });
    } catch (requestError) {
      setError(requestError.message || "Failed to load schedule.");
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const canGoNextDay = currentDayIndex < timelineDays.length - 1;
  const canGoPrevDay = currentDayIndex > 0;

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Schedule</h1>
          <p className="page-subtitle">
            View one venue schedule in a court timeline. Choose either one date
            or a day range and press Go.
          </p>
        </div>
      </div>

      <Card className="surface-card schedule-controls-card">
        <Card.Body>
          <Form onSubmit={handleScheduleRequest}>
            <Row className="g-3 align-items-end">
              <Col md={4}>
                <Form.Group controlId="schedule-venue-select">
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
                  {recentVenuePills.length > 0 ? (
                    <div className="schedule-recent-venues">
                      <span className="schedule-recent-venues-label">Recent</span>
                      {recentVenuePills.map((venue) => (
                        <Button
                          key={venue}
                          type="button"
                          size="sm"
                          className="rounded-pill schedule-recent-venue-pill"
                          variant={
                            selectedVenue === venue
                              ? "primary"
                              : "outline-secondary"
                          }
                          onClick={() => {
                            setSelectedVenue(venue);
                            setError("");
                          }}
                        >
                          {venue}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Request mode</Form.Label>
                  <div className="schedule-mode-toggle">
                    <Form.Check
                      type="radio"
                      id="schedule-mode-date"
                      name="schedule-mode"
                      label="Date"
                      value="date"
                      checked={queryMode === "date"}
                      onChange={(event) => setQueryMode(event.target.value)}
                    />
                    <Form.Check
                      type="radio"
                      id="schedule-mode-n-days"
                      name="schedule-mode"
                      label="N days"
                      value="n_days"
                      checked={queryMode === "n_days"}
                      onChange={(event) => setQueryMode(event.target.value)}
                    />
                  </div>
                </Form.Group>
              </Col>
              <Col md={3}>
                {queryMode === "date" ? (
                  <Form.Group controlId="schedule-date-input">
                    <Form.Label>Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                    />
                  </Form.Group>
                ) : (
                  <Form.Group controlId="schedule-n-days-input">
                    <Form.Label>N days</Form.Label>
                    <Form.Control
                      type="number"
                      min={MIN_N_DAYS}
                      step={1}
                      value={nDays}
                      onChange={(event) => setNDays(event.target.value)}
                    />
                  </Form.Group>
                )}
              </Col>
              <Col md={2} className="d-grid">
                <Button
                  type="submit"
                  disabled={isLoadingVenues || venues.length === 0 || isLoadingSchedule}
                >
                  {isLoadingSchedule ? "Loading..." : "Go"}
                </Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      {error ? (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {isLoadingSchedule ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : null}

      {!isLoadingSchedule && scheduleData && timelineDays.length === 0 ? (
        <Alert variant="secondary" className="mt-3">
          No schedule data was returned for the selected request.
        </Alert>
      ) : null}

      {!isLoadingSchedule && !scheduleData && venues.length > 0 ? (
        <Alert variant="secondary" className="mt-3">
          Choose inputs above and click Go to load the timeline.
        </Alert>
      ) : null}

      {!isLoadingSchedule && currentDay ? (
        <section className="schedule-timeline-section mt-4">
          <div className="schedule-pagination">
            <Button
              variant="outline-secondary"
              onClick={() => setCurrentDayIndex((currentIndex) => currentIndex - 1)}
              disabled={!canGoPrevDay}
            >
              Previous day
            </Button>
            <strong>{formatDayHeading(currentDay.dateKey)}</strong>
            <Button
              variant="outline-secondary"
              onClick={() => setCurrentDayIndex((currentIndex) => currentIndex + 1)}
              disabled={!canGoNextDay}
            >
              Next day
            </Button>
          </div>

          <div className="schedule-timeline-shell">
            <div className="schedule-timeline-scroll">
              <div
                className="schedule-timeline-grid schedule-timeline-header"
                style={timelineGridStyle}
              >
                <div className="schedule-timeline-time-header">Time</div>
                {currentDay.courts.map((court) => (
                  <div key={court.id} className="schedule-timeline-court-header">
                    {court.name}
                  </div>
                ))}
              </div>

              <div
                className="schedule-timeline-grid schedule-timeline-body"
                style={timelineGridStyle}
              >
                <div className="schedule-time-column" style={{ height: `${dayHeight}px` }}>
                  {timeMarks.map((minute) => (
                    <span
                      key={minute}
                      className="schedule-time-label"
                      style={{
                        top: `${(minute - windowStart) * PIXELS_PER_MINUTE}px`,
                      }}
                    >
                      {minutesToTime(minute)}
                    </span>
                  ))}
                </div>

                {currentDay.courts.map((court) => (
                  <div
                    key={court.id}
                    className="schedule-court-column"
                    style={{
                      height: `${dayHeight}px`,
                      backgroundSize: `100% ${TIME_MARK_INTERVAL * PIXELS_PER_MINUTE}px`,
                    }}
                  >
                    {court.sessions.map((session) => {
                      const sessionStart = Math.max(session.startTime, windowStart);
                      const sessionEnd = Math.min(session.endTime, windowEnd);

                      if (sessionEnd <= sessionStart) {
                        return null;
                      }

                      const top = (sessionStart - windowStart) * PIXELS_PER_MINUTE;
                      const height = Math.max(
                        (sessionEnd - sessionStart) * PIXELS_PER_MINUTE,
                        24
                      );

                      return (
                        <article
                          key={session.id}
                          className={`schedule-session-block ${
                            session.available
                              ? "schedule-session-available"
                              : "schedule-session-unavailable"
                          }`}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <div className="schedule-session-time">
                            {minutesToTime(session.startTime)} -{" "}
                            {minutesToTime(session.endTime)}
                          </div>
                          <div className="schedule-session-meta">
                            {session.available ? formatCurrency(session.price) : "Booked"}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </Container>
  );
};

export default SchedulePage;
