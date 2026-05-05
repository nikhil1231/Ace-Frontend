import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Container, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";

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
import { fdatetime, getToday, minutesToTime, timeToMinutes } from "../util";

import "./BookingsPage.css";

const TARGET_TAB = "targets";
const ACTIONS_TAB = "actions";

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

const parseMinutesValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && value.includes(":")) {
    const minutes = timeToMinutes(value);
    return minutes === "" ? null : Number(minutes);
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const extractSlotsPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.slots)) {
      return payload.slots;
    }

    if (Array.isArray(payload.Slots)) {
      return payload.Slots;
    }
  }

  return [];
};

const normalizeFindSlots = (payload) =>
  extractSlotsPayload(payload)
    .filter((slot) => slot && typeof slot === "object")
    .map((slot, index) => {
      const startTime = parseMinutesValue(
        slot.StartTime ?? slot.startTime ?? slot.start ?? slot.start_time
      );
      const endTime = parseMinutesValue(
        slot.EndTime ?? slot.endTime ?? slot.end ?? slot.end_time
      );
      const cost = Number(slot.Cost ?? slot.cost ?? slot.Price);
      const dateValue = String(slot.Date ?? slot.date ?? "").trim();
      const sessionId = String(slot.SessionID ?? slot.sessionId ?? "").trim();
      const courtNumber = Number(slot.CourtNumber ?? slot.courtNumber ?? slot.court);
      const venueName = String(
        slot.VenueName ?? slot.venueName ?? slot.Venue ?? slot.venue ?? ""
      ).trim();
      const slotName = String(slot.Name ?? slot.name ?? "").trim();

      return {
        id: `${venueName || "venue"}-${sessionId || index}-${index}`,
        venue: venueName || "Unknown venue",
        name: slotName || "Court slot",
        date: dateValue,
        startTime: Number.isFinite(startTime) ? startTime : 0,
        endTime: Number.isFinite(endTime) ? endTime : 0,
        courtNumber: Number.isFinite(courtNumber) ? courtNumber : null,
        cost: Number.isFinite(cost) ? cost : null,
        bookingLink: String(slot.BookingLink ?? slot.bookingLink ?? "").trim(),
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

const getSafeDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDayHeading = (value) => {
  const date = getSafeDate(value);

  if (!date) {
    return {
      weekday: "Unknown",
      dateLabel: String(value || "Unknown date"),
    };
  }

  return {
    weekday: date.toLocaleDateString("en-GB", { weekday: "short" }),
    dateLabel: date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
  };
};

const getRelativeDayLabel = (value) => {
  const date = getSafeDate(value);

  if (!date) {
    return "";
  }

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target - current) / 86400000);

  if (diffDays === 0) {
    return "today";
  }

  if (diffDays > 0) {
    return `in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  const elapsed = Math.abs(diffDays);
  return `${elapsed} day${elapsed === 1 ? "" : "s"} ago`;
};

const BookingsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const targetsPanelRef = useRef(null);
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
  const [activeTab, setActiveTab] = useState(TARGET_TAB);

  const sortedTargets = useMemo(
    () => [...bookingTargets].sort(sortBookingTargets),
    [bookingTargets]
  );

  const totalBookings = useMemo(
    () =>
      Object.values(bookings).reduce(
        (count, bookingList) => count + bookingList.length,
        0
      ),
    [bookings]
  );

  const matchedSlotsCount = useMemo(() => {
    const start = timeToMinutes(targetActionValues.startTime);
    const end = timeToMinutes(targetActionValues.endTime);

    if (start === "" || end === "") {
      return 0;
    }

    return findResultSlots.filter(
      (slot) => slot.startTime === start && slot.endTime === end
    ).length;
  }, [findResultSlots, targetActionValues.endTime, targetActionValues.startTime]);

  const loadBookings = useCallback(
    async ({ initial = false, background = false } = {}) => {
      if (initial) {
        setIsLoadingBookings(true);
      } else if (!background) {
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
        } else if (!background) {
          setIsRefreshingBookings(false);
        }
      }
    },
    []
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

  useEffect(() => {
    const prefill = location.state?.targetActionPrefill;

    if (!prefill || typeof prefill !== "object") {
      return;
    }

    setTargetActionValues((currentValue) => ({
      ...currentValue,
      venue:
        typeof prefill.venue === "string" ? prefill.venue : currentValue.venue,
      date: typeof prefill.date === "string" ? prefill.date : currentValue.date,
      startTime:
        typeof prefill.startTime === "string"
          ? prefill.startTime
          : currentValue.startTime,
      endTime:
        typeof prefill.endTime === "string" ? prefill.endTime : currentValue.endTime,
      numCourts:
        typeof prefill.numCourts === "string"
          ? prefill.numCourts
          : currentValue.numCourts,
      recurringWeekly: false,
    }));

    const pipedSlots = Array.isArray(prefill.slotOptions) ? prefill.slotOptions : [];
    setFindResultRaw(pipedSlots);
    setFindResultSlots(normalizeFindSlots(pipedSlots));
    setTargetActionError("");
    setTargetActionSuccess(
      pipedSlots.length > 0
        ? `Loaded ${pipedSlots.length} slot option(s) from availability.`
        : "Target action inputs prefilled from availability."
    );
    setActiveTab(ACTIONS_TAB);

    window.requestAnimationFrame(() => {
      targetsPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const pollIntervalMs = 2500;
    const intervalId = window.setInterval(() => {
      loadBookings({ background: true });
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadBookings]);

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
    } finally {
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
      setGlobalActionError(requestError.message || "Failed to run booking targets.");
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

    const { payload, error } = buildBookingTargetPayload({
      ...targetActionValues,
      recurringWeekly: false,
    });

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

    const { payload, error } = buildBookingTargetPayload({
      ...targetActionValues,
      recurringWeekly: false,
    });

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

  const renderVenueField = (idPrefix, value, onChange) => (
    <div className="bookings-field bookings-field-venue">
      <label htmlFor={`${idPrefix}-venue`}>Venue</label>
      {venues.length > 0 ? (
        <select
          id={`${idPrefix}-venue`}
          className="bookings-select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={isLoadingVenues}
          required
        >
          {venues.map((venue) => (
            <option key={venue} value={venue}>
              {venue}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`${idPrefix}-venue`}
          className="bookings-input bookings-mono"
          type="text"
          value={value}
          placeholder={isLoadingVenues ? "Loading venues..." : "Enter venue (slug)"}
          onChange={(event) => onChange(event.target.value)}
          disabled={isLoadingVenues}
          required
        />
      )}
    </div>
  );

  const renderTargetFields = (idPrefix, values, onChange) => (
    <>
      <div className="bookings-form-row bookings-form-row-three">
        {renderVenueField(idPrefix, values.venue, (nextValue) =>
          onChange("venue", nextValue)
        )}
        <div className="bookings-field">
          <label htmlFor={`${idPrefix}-date`}>Date</label>
          <input
            id={`${idPrefix}-date`}
            className="bookings-input bookings-mono"
            type="date"
            value={values.date}
            onChange={(event) => onChange("date", event.target.value)}
            required
          />
        </div>
        <div className="bookings-field bookings-field-number">
          <label htmlFor={`${idPrefix}-courts`}>Courts</label>
          <input
            id={`${idPrefix}-courts`}
            className="bookings-input bookings-mono"
            type="number"
            min={1}
            step={1}
            value={values.numCourts}
            onChange={(event) => onChange("numCourts", event.target.value)}
            required
          />
        </div>
      </div>
      <div className="bookings-form-row bookings-form-row-two">
        <div className="bookings-field bookings-field-time">
          <label htmlFor={`${idPrefix}-start`}>Start time</label>
          <input
            id={`${idPrefix}-start`}
            className="bookings-input bookings-mono"
            type="time"
            step={1800}
            value={values.startTime}
            onChange={(event) => onChange("startTime", event.target.value)}
            required
          />
        </div>
        <div className="bookings-field bookings-field-time">
          <label htmlFor={`${idPrefix}-end`}>End time</label>
          <input
            id={`${idPrefix}-end`}
            className="bookings-input bookings-mono"
            type="time"
            step={1800}
            value={values.endTime}
            onChange={(event) => onChange("endTime", event.target.value)}
            required
          />
        </div>
      </div>
    </>
  );

  return (
    <Container fluid="lg" className="page-container bookings-page">
      <section className="bookings-page-head">
        <div>
          <h1>Bookings</h1>
          <p className="bookings-page-subtitle">
            Manage live bookings, scheduled targets, and manual booking actions.
          </p>
          <p className="bookings-page-meta">
            Last updated{" "}
            <strong>{lastUpdatedTime ? fdatetime(lastUpdatedTime) : "Unknown"}</strong>
            <span aria-hidden="true"> - </span>
            {totalBookings} active booking{totalBookings === 1 ? "" : "s"}
            <span aria-hidden="true"> - </span>
            {sortedTargets.length} scheduled target
            {sortedTargets.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="bookings-page-actions">
          <button
            type="button"
            className="bookings-btn"
            onClick={handleRefreshBookings}
            disabled={isRefreshingBookings || !hasAdminAccess}
          >
            {isRefreshingBookings ? "Refreshing..." : "Refresh bookings"}
          </button>
          <button
            type="button"
            className="bookings-btn"
            onClick={handleRunBookingTargets}
            disabled={isRunningBookTargets || !hasAdminAccess}
          >
            {isRunningBookTargets ? "Running..." : "Run booking targets"}
          </button>
          <button
            type="button"
            className="bookings-btn"
            onClick={handleCleanTargets}
            disabled={isCleaningTargets || !hasAdminAccess}
          >
            {isCleaningTargets ? "Cleaning..." : "Clean stale targets"}
          </button>
        </div>
      </section>

      {!hasAdminAccess ? (
        <Alert variant="warning" className="bookings-alert">
          Admin token is required for write actions. Finding bookable slots is
          available without a token.
        </Alert>
      ) : null}

      {globalActionError ? (
        <Alert variant="danger" className="bookings-alert">
          {globalActionError}
        </Alert>
      ) : null}
      {globalActionSuccess ? (
        <Alert variant="success" className="bookings-alert">
          {globalActionSuccess}
        </Alert>
      ) : null}

      <div className="bookings-grid">
        <section className="bookings-card">
          <div className="bookings-card-head">
            <h2>Bookings cache</h2>
            <span className="bookings-count">{totalBookings}</span>
            <span className="bookings-card-head-note">Grouped by date</span>
          </div>
          <div className="bookings-card-body">
            {bookingsError ? <Alert variant="danger">{bookingsError}</Alert> : null}
            {isLoadingBookings ? (
              <div className="bookings-loading">
                <Spinner animation="border" size="sm" />
                <span>Loading bookings...</span>
              </div>
            ) : null}

            {!isLoadingBookings && Object.keys(bookings).length === 0 ? (
              <div className="bookings-empty">No cached bookings are available yet.</div>
            ) : null}

            {!isLoadingBookings
              ? Object.entries(bookings).map(([date, dateBookings]) => {
                  const dayHeading = getDayHeading(date);
                  const relativeLabel = getRelativeDayLabel(date);

                  return (
                    <section className="bookings-day-group" key={date}>
                      <div className="bookings-day-head">
                        <span className="bookings-day-weekday">{dayHeading.weekday}</span>
                        <span className="bookings-day-date">{dayHeading.dateLabel}</span>
                        {relativeLabel ? (
                          <span className="bookings-day-relative">{relativeLabel}</span>
                        ) : null}
                      </div>

                      {dateBookings.map((booking, index) => (
                        <article
                          className="booking-row"
                          key={`${date}-${booking.SessionID}-${index}`}
                        >
                          <div className="booking-row-time bookings-mono">
                            <strong>{minutesToTime(booking.StartTime)}</strong>
                            <span>{`-> ${minutesToTime(booking.EndTime)}`}</span>
                          </div>
                          <div className="booking-row-main">
                            <p className="booking-row-title">
                              {booking.Venue}
                              {booking.CourtNumber ? (
                                <span> Court {booking.CourtNumber}</span>
                              ) : null}
                            </p>
                            <div className="booking-row-meta">
                              <span>{formatPrice(booking.Cost)} booking cost</span>
                              <span className="booking-row-cancel-deadline">
                                Cancel by {fdatetime(booking.CancelDeadline)}
                              </span>
                            </div>
                          </div>
                          <div className="booking-row-actions">
                            <button
                              type="button"
                              className="bookings-btn bookings-btn-danger"
                              onClick={() => handleCancelBooking(booking)}
                              disabled={!hasAdminAccess}
                            >
                              Cancel
                            </button>
                          </div>
                        </article>
                      ))}
                    </section>
                  );
                })
              : null}
          </div>
        </section>
        <section className="bookings-card" ref={targetsPanelRef}>
          <div className="bookings-card-head">
            <h2>{activeTab === TARGET_TAB ? "Targets" : "Manual run"}</h2>
            {activeTab === TARGET_TAB ? (
              <span className="bookings-count">{sortedTargets.length}</span>
            ) : null}
            <div className="bookings-tab-strip">
              <button
                type="button"
                className={activeTab === TARGET_TAB ? "active" : ""}
                onClick={() => setActiveTab(TARGET_TAB)}
              >
                Scheduled
              </button>
              <button
                type="button"
                className={activeTab === ACTIONS_TAB ? "active" : ""}
                onClick={() => setActiveTab(ACTIONS_TAB)}
              >
                Manual run
              </button>
            </div>
          </div>

          <div className="bookings-card-body">
            {targetsError ? <Alert variant="danger">{targetsError}</Alert> : null}
            {venuesError ? <Alert variant="warning">{venuesError}</Alert> : null}

            {activeTab === TARGET_TAB ? (
              <>
                {targetCrudError ? <Alert variant="danger">{targetCrudError}</Alert> : null}
                {targetCrudSuccess ? (
                  <Alert variant="success">{targetCrudSuccess}</Alert>
                ) : null}

                <form onSubmit={handleAddTarget} className="bookings-form">
                  {renderTargetFields(
                    "target-crud",
                    targetFormValues,
                    handleTargetFormChange
                  )}

                  <div className="bookings-form-foot">
                    <label className="bookings-switch">
                      <input
                        type="checkbox"
                        checked={targetFormValues.recurringWeekly}
                        onChange={(event) =>
                          handleTargetFormChange(
                            "recurringWeekly",
                            event.target.checked
                          )
                        }
                      />
                      <span className="bookings-switch-track" />
                      <span className="bookings-switch-label">Recurring weekly</span>
                    </label>
                    <span className="bookings-spacer" />
                    <button
                      type="button"
                      className="bookings-btn bookings-btn-ghost"
                      onClick={resetTargetForm}
                    >
                      Reset
                    </button>
                    <button
                      type="submit"
                      className="bookings-btn bookings-btn-primary"
                      disabled={!hasAdminAccess || isSavingTarget || isLoadingVenues}
                    >
                      {isSavingTarget ? "Adding..." : "Add target"}
                    </button>
                  </div>
                </form>

                <div className="bookings-list-head">
                  <h3>Scheduled targets</h3>
                  <button
                    type="button"
                    className="bookings-btn bookings-btn-ghost"
                    onClick={() => loadBookingTargets()}
                    disabled={isLoadingTargets || isRefreshingTargets}
                  >
                    {isRefreshingTargets ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {isLoadingTargets ? (
                  <div className="bookings-loading">
                    <Spinner animation="border" size="sm" />
                    <span>Loading targets...</span>
                  </div>
                ) : null}

                {!isLoadingTargets && sortedTargets.length === 0 ? (
                  <div className="bookings-empty">
                    No booking targets are scheduled yet.
                  </div>
                ) : null}

                {!isLoadingTargets ? (
                  <div className="target-list">
                    {sortedTargets.map((target, index) => {
                      const targetKey = buildTargetKey(target);
                      const numCourts = Number(target.NumCourts || 1);

                      return (
                        <article
                          className="target-row"
                          key={`${targetKey}-${index}`}
                        >
                          <div>
                            <div className="target-line">
                              <strong>{target.Venue}</strong>
                              <span
                                className={
                                  target.RecurringWeekly
                                    ? "target-badge target-badge-recur"
                                    : "target-badge"
                                }
                              >
                                {target.RecurringWeekly
                                  ? "Recurring weekly"
                                  : "One-off"}
                              </span>
                            </div>
                            <p className="target-meta bookings-mono">
                              {target.Date} | {minutesToTime(target.StartTime)} -{" "}
                              {minutesToTime(target.EndTime)} | {numCourts} court
                              {numCourts === 1 ? "" : "s"}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="bookings-btn bookings-btn-danger-outline"
                            onClick={() => handleDeleteTarget(target)}
                            disabled={
                              !hasAdminAccess ||
                              isSavingTarget ||
                              deletingTargetKey === targetKey
                            }
                            title="Delete target"
                          >
                            {deletingTargetKey === targetKey ? "Deleting..." : "Delete"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}

            {activeTab === ACTIONS_TAB ? (
              <>
                {targetActionError ? (
                  <Alert variant="danger">{targetActionError}</Alert>
                ) : null}
                {targetActionSuccess ? (
                  <Alert variant="success">{targetActionSuccess}</Alert>
                ) : null}

                <form
                  className="bookings-form"
                  onSubmit={(event) => event.preventDefault()}
                >
                  {renderTargetFields(
                    "target-actions",
                    targetActionValues,
                    handleTargetActionFormChange
                  )}

                  <div className="bookings-form-foot bookings-form-foot-wrap">
                    <label className="bookings-switch">
                      <input
                        type="checkbox"
                        checked={dryRun}
                        onChange={(event) => setDryRun(event.target.checked)}
                      />
                      <span className="bookings-switch-track" />
                      <span className="bookings-switch-label">
                        Dry run (for Book target now)
                      </span>
                    </label>

                    <span className="bookings-spacer" />
                    <button
                      type="button"
                      className="bookings-btn bookings-btn-ghost"
                      onClick={resetTargetActionForm}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className="bookings-btn"
                      onClick={handleFindBookableSlots}
                      disabled={isFindingSlots || isBookingTargetNow}
                    >
                      {isFindingSlots ? "Finding..." : "Find bookable slots"}
                    </button>
                    <button
                      type="button"
                      className="bookings-btn bookings-btn-primary"
                      onClick={handleBookTargetNow}
                      disabled={!hasAdminAccess || isBookingTargetNow || isFindingSlots}
                    >
                      {isBookingTargetNow ? "Running..." : "Book target now"}
                    </button>
                  </div>
                </form>

                {findResultRaw !== null ? (
                  <section className="bookings-find-results">
                    <div className="bookings-list-head">
                      <h3>Find results</h3>
                      <p>
                        {findResultSlots.length} slot
                        {findResultSlots.length === 1 ? "" : "s"}
                        {findResultSlots.length > 0
                          ? ` | ${matchedSlotsCount} match selected window`
                          : ""}
                      </p>
                    </div>

                    {findResultSlots.length === 0 ? (
                      <div className="bookings-empty">
                        No bookable slots matched the target.
                      </div>
                    ) : (
                      <div className="slot-grid">
                        {findResultSlots.map((slot) => {
                          const isWindowMatch =
                            slot.startTime ===
                              timeToMinutes(targetActionValues.startTime) &&
                            slot.endTime === timeToMinutes(targetActionValues.endTime);

                          return (
                            <article
                              key={slot.id}
                              className={`slot-card${isWindowMatch ? " slot-card-match" : ""}`}
                            >
                              <p className="slot-court">
                                {slot.courtNumber !== null
                                  ? `Court ${slot.courtNumber}`
                                  : "Court"}
                                {isWindowMatch ? " | match" : ""}
                              </p>
                              <p className="slot-time bookings-mono">
                                {minutesToTime(slot.startTime)} - {minutesToTime(slot.endTime)}
                              </p>
                              <p className="slot-meta">
                                {slot.date || "Unknown date"} |{" "}
                                {slot.cost === null ? "Price unavailable" : formatPrice(slot.cost)}
                              </p>
                              {slot.bookingLink ? (
                                <a
                                  className="slot-link"
                                  href={slot.bookingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Open booking page
                                </a>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}

                    <details className="bookings-raw-response">
                      <summary>Raw response</summary>
                      <pre>{JSON.stringify(findResultRaw, null, 2)}</pre>
                    </details>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      </div>
    </Container>
  );
};

export default BookingsPage;
