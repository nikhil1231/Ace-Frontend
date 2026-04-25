import React, { useEffect, useMemo, useState } from "react";
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

import { getAvailability, getSchedule, getVenues } from "../api";
import { getToday, minutesToTime } from "../util";

const MIN_N_DAYS = 1;
const DEFAULT_N_DAYS = 7;
const DEFAULT_MAX_VENUES = 50;
const DEFAULT_MIN_START_TIME = "00:00";
const DEFAULT_MAX_START_TIME = "24:00";
const DEFAULT_MIN_END_TIME = "00:00";
const DEFAULT_MAX_END_TIME = "24:00";
const MIN_LENGTH_OPTIONS = ["30", "60", "90", "120"];
const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const TIME_MARK_INTERVAL = 30;
const PIXELS_PER_MINUTE = 1.2;
const FALLBACK_DAY_START = 7 * 60;
const FALLBACK_DAY_END = 22 * 60;
const SCHEDULE_SEARCH_STORAGE_KEY = "ACE_SCHEDULE_SEARCH_V1";
const MAX_RECENT_VENUES = 3;
const TIME_SELECT_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const totalMinutes = index * 30;
  if (totalMinutes === 24 * 60) {
    return "24:00";
  }

  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
});

const DEFAULT_SEARCH_STATE = {
  searchMode: "schedule",
  selectedVenue: "",
  scheduleQueryMode: "date",
  scheduleDate: getToday(),
  scheduleNDays: String(DEFAULT_N_DAYS),
  recentVenues: [],
  availabilityQueryMode: "n_days",
  availabilityDate: getToday(),
  availabilityNDays: String(DEFAULT_N_DAYS),
  availabilityPostcode: "",
  availabilityMaxVenues: String(DEFAULT_MAX_VENUES),
  availabilityMinStartTime: DEFAULT_MIN_START_TIME,
  availabilityMaxStartTime: DEFAULT_MAX_START_TIME,
  availabilityMinEndTime: DEFAULT_MIN_END_TIME,
  availabilityMaxEndTime: DEFAULT_MAX_END_TIME,
  availabilityMinLength: "",
};

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const sanitizeSearchMode = (value) =>
  value === "availability" ? "availability" : "schedule";

const sanitizeQueryMode = (value) => (value === "n_days" ? "n_days" : "date");

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

const sanitizeMaxVenuesValue = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return String(DEFAULT_MAX_VENUES);
  }

  return String(parsed);
};

const sanitizePostcodeValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.toUpperCase().trim();
};

const sanitizeTimeValue = (value, fallback) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return TIME_VALUE_PATTERN.test(normalized) ? normalized : fallback;
};

const sanitizeMinLengthValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return "";
  }

  const normalized = String(parsed);
  return MIN_LENGTH_OPTIONS.includes(normalized) ? normalized : "";
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
      searchMode: sanitizeSearchMode(parsed?.searchMode),
      selectedVenue,
      scheduleQueryMode: sanitizeQueryMode(
        parsed?.scheduleQueryMode ?? parsed?.queryMode
      ),
      scheduleDate: sanitizeDateValue(parsed?.scheduleDate ?? parsed?.selectedDate),
      scheduleNDays: sanitizeNDaysValue(parsed?.scheduleNDays ?? parsed?.nDays),
      recentVenues: sanitizeRecentVenues(parsed?.recentVenues),
      availabilityQueryMode: sanitizeQueryMode(parsed?.availabilityQueryMode),
      availabilityDate: sanitizeDateValue(parsed?.availabilityDate),
      availabilityNDays: sanitizeNDaysValue(parsed?.availabilityNDays),
      availabilityPostcode: sanitizePostcodeValue(parsed?.availabilityPostcode),
      availabilityMaxVenues: sanitizeMaxVenuesValue(parsed?.availabilityMaxVenues),
      availabilityMinStartTime: sanitizeTimeValue(
        parsed?.availabilityMinStartTime,
        DEFAULT_MIN_START_TIME
      ),
      availabilityMaxStartTime: sanitizeTimeValue(
        parsed?.availabilityMaxStartTime,
        DEFAULT_MAX_START_TIME
      ),
      availabilityMinEndTime: sanitizeTimeValue(
        parsed?.availabilityMinEndTime,
        DEFAULT_MIN_END_TIME
      ),
      availabilityMaxEndTime: sanitizeTimeValue(
        parsed?.availabilityMaxEndTime,
        DEFAULT_MAX_END_TIME
      ),
      availabilityMinLength: sanitizeMinLengthValue(parsed?.availabilityMinLength),
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
    searchMode: sanitizeSearchMode(nextState?.searchMode),
    selectedVenue:
      typeof nextState?.selectedVenue === "string" ? nextState.selectedVenue : "",
    scheduleQueryMode: sanitizeQueryMode(nextState?.scheduleQueryMode),
    scheduleDate: sanitizeDateValue(nextState?.scheduleDate),
    scheduleNDays: sanitizeNDaysValue(nextState?.scheduleNDays),
    recentVenues: sanitizeRecentVenues(nextState?.recentVenues),
    availabilityQueryMode: sanitizeQueryMode(nextState?.availabilityQueryMode),
    availabilityDate: sanitizeDateValue(nextState?.availabilityDate),
    availabilityNDays: sanitizeNDaysValue(nextState?.availabilityNDays),
    availabilityPostcode: sanitizePostcodeValue(nextState?.availabilityPostcode),
    availabilityMaxVenues: sanitizeMaxVenuesValue(nextState?.availabilityMaxVenues),
    availabilityMinStartTime: sanitizeTimeValue(
      nextState?.availabilityMinStartTime,
      DEFAULT_MIN_START_TIME
    ),
    availabilityMaxStartTime: sanitizeTimeValue(
      nextState?.availabilityMaxStartTime,
      DEFAULT_MAX_START_TIME
    ),
    availabilityMinEndTime: sanitizeTimeValue(
      nextState?.availabilityMinEndTime,
      DEFAULT_MIN_END_TIME
    ),
    availabilityMaxEndTime: sanitizeTimeValue(
      nextState?.availabilityMaxEndTime,
      DEFAULT_MAX_END_TIME
    ),
    availabilityMinLength: sanitizeMinLengthValue(nextState?.availabilityMinLength),
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
    return "Price unavailable";
  }

  return `\u00A3${amount.toFixed(2)}`;
};

const formatDistance = (distance) => {
  if (typeof distance !== "number" || Number.isNaN(distance)) {
    return "Distance unavailable";
  }

  return `${distance.toFixed(1)} km`;
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

const buildAvailabilityGroups = (slots) => {
  if (!Array.isArray(slots)) {
    return [];
  }

  const groupedSlots = new Map();

  slots.forEach((slot, index) => {
    const dateKey = normalizeDateKey(slot?.Date);
    if (!dateKey) {
      return;
    }

    const parsedStartTime = Number(slot?.StartTime);
    const parsedEndTime = Number(slot?.EndTime);
    const parsedDistance = Number(slot?.Distance);

    const startTime = Number.isFinite(parsedStartTime) ? parsedStartTime : 0;
    const endTime = Number.isFinite(parsedEndTime) ? parsedEndTime : startTime;
    const distance = Number.isFinite(parsedDistance) ? parsedDistance : null;
    const venueName =
      typeof slot?.VenueName === "string" && slot.VenueName.trim().length > 0
        ? slot.VenueName
        : slot?.Venue || "Unknown venue";

    if (!groupedSlots.has(dateKey)) {
      groupedSlots.set(dateKey, []);
    }

    groupedSlots.get(dateKey).push({
      id: `${dateKey}-${slot?.SessionID || slot?.Venue || "slot"}-${index}`,
      venueName,
      venue: slot?.Venue || "",
      name: slot?.Name || "",
      courtNumber:
        typeof slot?.CourtNumber === "number" && Number.isFinite(slot.CourtNumber)
          ? slot.CourtNumber
          : null,
      startTime,
      endTime,
      cost:
        typeof slot?.Cost === "number" && Number.isFinite(slot.Cost)
          ? slot.Cost
          : null,
      distance,
      bookingLink: slot?.BookingLink || null,
    });
  });

  return [...groupedSlots.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([dateKey, daySlots]) => ({
      dateKey,
      slots: daySlots
        .filter((slot) => slot.endTime > slot.startTime)
        .sort((first, second) => {
          const firstDistance =
            first.distance === null ? Number.POSITIVE_INFINITY : first.distance;
          const secondDistance =
            second.distance === null ? Number.POSITIVE_INFINITY : second.distance;

          return (
            firstDistance - secondDistance ||
            first.startTime - second.startTime ||
            first.venueName.localeCompare(second.venueName)
          );
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
  const [searchMode, setSearchMode] = useState(persistedSearchState.searchMode);

  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(
    persistedSearchState.selectedVenue
  );
  const [scheduleQueryMode, setScheduleQueryMode] = useState(
    persistedSearchState.scheduleQueryMode
  );
  const [scheduleDate, setScheduleDate] = useState(
    persistedSearchState.scheduleDate
  );
  const [scheduleNDays, setScheduleNDays] = useState(
    persistedSearchState.scheduleNDays
  );
  const [recentVenues, setRecentVenues] = useState(
    persistedSearchState.recentVenues
  );

  const [availabilityQueryMode, setAvailabilityQueryMode] = useState(
    persistedSearchState.availabilityQueryMode
  );
  const [availabilityDate, setAvailabilityDate] = useState(
    persistedSearchState.availabilityDate
  );
  const [availabilityNDays, setAvailabilityNDays] = useState(
    persistedSearchState.availabilityNDays
  );
  const [availabilityPostcode, setAvailabilityPostcode] = useState(
    persistedSearchState.availabilityPostcode
  );
  const [availabilityMaxVenues, setAvailabilityMaxVenues] = useState(
    persistedSearchState.availabilityMaxVenues
  );
  const [availabilityMinStartTime, setAvailabilityMinStartTime] = useState(
    persistedSearchState.availabilityMinStartTime
  );
  const [availabilityMaxStartTime, setAvailabilityMaxStartTime] = useState(
    persistedSearchState.availabilityMaxStartTime
  );
  const [availabilityMinEndTime, setAvailabilityMinEndTime] = useState(
    persistedSearchState.availabilityMinEndTime
  );
  const [availabilityMaxEndTime, setAvailabilityMaxEndTime] = useState(
    persistedSearchState.availabilityMaxEndTime
  );
  const [availabilityMinLength, setAvailabilityMinLength] = useState(
    persistedSearchState.availabilityMinLength
  );

  const [scheduleData, setScheduleData] = useState(null);
  const [availabilitySlots, setAvailabilitySlots] = useState(null);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
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
  const availabilityGroups = useMemo(
    () => buildAvailabilityGroups(availabilitySlots),
    [availabilitySlots]
  );
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

  const persistCurrentState = ({
    nextSearchMode = searchMode,
    nextRecentVenues = recentVenues,
    nextScheduleNDays = scheduleNDays,
    nextAvailabilityNDays = availabilityNDays,
    nextAvailabilityPostcode = availabilityPostcode,
    nextAvailabilityMaxVenues = availabilityMaxVenues,
    nextAvailabilityMinStartTime = availabilityMinStartTime,
    nextAvailabilityMaxStartTime = availabilityMaxStartTime,
    nextAvailabilityMinEndTime = availabilityMinEndTime,
    nextAvailabilityMaxEndTime = availabilityMaxEndTime,
    nextAvailabilityMinLength = availabilityMinLength,
  } = {}) => {
    persistSearchState({
      searchMode: nextSearchMode,
      selectedVenue,
      scheduleQueryMode,
      scheduleDate,
      scheduleNDays: nextScheduleNDays,
      recentVenues: nextRecentVenues,
      availabilityQueryMode,
      availabilityDate,
      availabilityNDays: nextAvailabilityNDays,
      availabilityPostcode: nextAvailabilityPostcode,
      availabilityMaxVenues: nextAvailabilityMaxVenues,
      availabilityMinStartTime: nextAvailabilityMinStartTime,
      availabilityMaxStartTime: nextAvailabilityMaxStartTime,
      availabilityMinEndTime: nextAvailabilityMinEndTime,
      availabilityMaxEndTime: nextAvailabilityMaxEndTime,
      availabilityMinLength: nextAvailabilityMinLength,
    });
  };

  const handleScheduleRequest = async (event) => {
    event.preventDefault();

    if (searchMode === "schedule") {
      if (!selectedVenue) {
        setError("Please select a venue before requesting the schedule.");
        return;
      }

      if (scheduleQueryMode === "date" && !scheduleDate) {
        setError("Please select a date.");
        return;
      }

      const parsedNDays = Number.parseInt(scheduleNDays, 10);
      if (
        scheduleQueryMode === "n_days" &&
        (!Number.isInteger(parsedNDays) || parsedNDays < MIN_N_DAYS)
      ) {
        setError(
          `Please enter n_days as an integer greater than or equal to ${MIN_N_DAYS}.`
        );
        return;
      }

      setIsLoadingResults(true);
      setError("");

      try {
        const nextSchedule = await getSchedule({
          venue: selectedVenue,
          date: scheduleQueryMode === "date" ? scheduleDate : undefined,
          nDays: scheduleQueryMode === "n_days" ? parsedNDays : undefined,
        });

        const nextRecentVenues = updateRecentVenues(recentVenues, selectedVenue);
        setScheduleData(nextSchedule);
        setCurrentDayIndex(0);
        setRecentVenues(nextRecentVenues);
        persistCurrentState({
          nextSearchMode: "schedule",
          nextRecentVenues,
          nextScheduleNDays:
            scheduleQueryMode === "n_days" ? String(parsedNDays) : scheduleNDays,
        });
      } catch (requestError) {
        setError(requestError.message || "Failed to load schedule.");
      } finally {
        setIsLoadingResults(false);
      }

      return;
    }

    const normalizedPostcode = sanitizePostcodeValue(availabilityPostcode);
    if (!normalizedPostcode) {
      setError("Please enter a postcode or outcode.");
      return;
    }

    if (availabilityQueryMode === "date" && !availabilityDate) {
      setError("Please select a date.");
      return;
    }

    const parsedAvailabilityNDays = Number.parseInt(availabilityNDays, 10);
    if (
      availabilityQueryMode === "n_days" &&
      (!Number.isInteger(parsedAvailabilityNDays) ||
        parsedAvailabilityNDays < MIN_N_DAYS)
    ) {
      setError(
        `Please enter n_days as an integer greater than or equal to ${MIN_N_DAYS}.`
      );
      return;
    }

    const parsedMaxVenues = Number.parseInt(availabilityMaxVenues, 10);
    if (!Number.isInteger(parsedMaxVenues) || parsedMaxVenues < 1) {
      setError("Please enter max venues as an integer greater than or equal to 1.");
      return;
    }

    const normalizedMinStartTime = sanitizeTimeValue(
      availabilityMinStartTime,
      DEFAULT_MIN_START_TIME
    );
    const normalizedMaxStartTime = sanitizeTimeValue(
      availabilityMaxStartTime,
      DEFAULT_MAX_START_TIME
    );
    const normalizedMinEndTime = sanitizeTimeValue(
      availabilityMinEndTime,
      DEFAULT_MIN_END_TIME
    );
    const normalizedMaxEndTime = sanitizeTimeValue(
      availabilityMaxEndTime,
      DEFAULT_MAX_END_TIME
    );
    const normalizedMinLength = sanitizeMinLengthValue(availabilityMinLength);
    const parsedMinLength =
      normalizedMinLength === ""
        ? undefined
        : Number.parseInt(normalizedMinLength, 10);

    setIsLoadingResults(true);
    setError("");

    try {
      const nextAvailability = await getAvailability({
        postcode: normalizedPostcode,
        maxVenues: parsedMaxVenues,
        date: availabilityQueryMode === "date" ? availabilityDate : undefined,
        nDays:
          availabilityQueryMode === "n_days"
            ? parsedAvailabilityNDays
            : undefined,
        minStartTime: normalizedMinStartTime,
        maxStartTime: normalizedMaxStartTime,
        minEndTime: normalizedMinEndTime,
        maxEndTime: normalizedMaxEndTime,
        minLength: parsedMinLength,
      });

      setAvailabilitySlots(Array.isArray(nextAvailability) ? nextAvailability : []);
      setAvailabilityPostcode(normalizedPostcode);
      setAvailabilityMinStartTime(normalizedMinStartTime);
      setAvailabilityMaxStartTime(normalizedMaxStartTime);
      setAvailabilityMinEndTime(normalizedMinEndTime);
      setAvailabilityMaxEndTime(normalizedMaxEndTime);
      setAvailabilityMinLength(normalizedMinLength);
      persistCurrentState({
        nextSearchMode: "availability",
        nextAvailabilityPostcode: normalizedPostcode,
        nextAvailabilityNDays:
          availabilityQueryMode === "n_days"
            ? String(parsedAvailabilityNDays)
            : availabilityNDays,
        nextAvailabilityMaxVenues: String(parsedMaxVenues),
        nextAvailabilityMinStartTime: normalizedMinStartTime,
        nextAvailabilityMaxStartTime: normalizedMaxStartTime,
        nextAvailabilityMinEndTime: normalizedMinEndTime,
        nextAvailabilityMaxEndTime: normalizedMaxEndTime,
        nextAvailabilityMinLength: normalizedMinLength,
      });
    } catch (requestError) {
      setError(requestError.message || "Failed to load availability.");
    } finally {
      setIsLoadingResults(false);
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
            View a single venue timeline or search cross-venue availability with
            postcode/outcode, time windows, minimum session length, and max venue
            limits.
          </p>
        </div>
      </div>

      <Card className="surface-card schedule-controls-card">
        <Card.Body>
          <Form onSubmit={handleScheduleRequest}>
            <Row className="g-3 align-items-end">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Search type</Form.Label>
                  <div className="schedule-mode-toggle">
                    <Form.Check
                      type="radio"
                      id="schedule-search-mode-schedule"
                      name="schedule-search-mode"
                      label="Schedule"
                      value="schedule"
                      checked={searchMode === "schedule"}
                      onChange={(event) => {
                        setSearchMode(event.target.value);
                        setError("");
                      }}
                    />
                    <Form.Check
                      type="radio"
                      id="schedule-search-mode-availability"
                      name="schedule-search-mode"
                      label="Availability"
                      value="availability"
                      checked={searchMode === "availability"}
                      onChange={(event) => {
                        setSearchMode(event.target.value);
                        setError("");
                      }}
                    />
                  </div>
                </Form.Group>
              </Col>
              {searchMode === "schedule" ? (
                <>
                  <Col md={3}>
                    <Form.Group controlId="schedule-venue-select">
                      <Form.Label>Venue</Form.Label>
                      <Form.Select
                        value={selectedVenue}
                        onChange={(event) => setSelectedVenue(event.target.value)}
                        disabled={isLoadingVenues}
                      >
                        {venues.length === 0 ? (
                          <option value="">
                            {isLoadingVenues
                              ? "Loading venues..."
                              : "No venues found"}
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
                  <Col md={2}>
                    <Form.Group>
                      <Form.Label>Request mode</Form.Label>
                      <div className="schedule-mode-toggle">
                        <Form.Check
                          type="radio"
                          id="schedule-mode-date"
                          name="schedule-mode"
                          label="Date"
                          value="date"
                          checked={scheduleQueryMode === "date"}
                          onChange={(event) => setScheduleQueryMode(event.target.value)}
                        />
                        <Form.Check
                          type="radio"
                          id="schedule-mode-n-days"
                          name="schedule-mode"
                          label="N days"
                          value="n_days"
                          checked={scheduleQueryMode === "n_days"}
                          onChange={(event) => setScheduleQueryMode(event.target.value)}
                        />
                      </div>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    {scheduleQueryMode === "date" ? (
                      <Form.Group controlId="schedule-date-input">
                        <Form.Label>Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={scheduleDate}
                          onChange={(event) => setScheduleDate(event.target.value)}
                        />
                      </Form.Group>
                    ) : (
                      <Form.Group controlId="schedule-n-days-input">
                        <Form.Label>N days</Form.Label>
                        <Form.Control
                          type="number"
                          min={MIN_N_DAYS}
                          step={1}
                          value={scheduleNDays}
                          onChange={(event) => setScheduleNDays(event.target.value)}
                        />
                      </Form.Group>
                    )}
                  </Col>
                </>
              ) : (
                <>
                  <Col md={2}>
                    <Form.Group controlId="availability-postcode-input">
                      <Form.Label>Postcode or outcode</Form.Label>
                      <Form.Control
                        type="text"
                        value={availabilityPostcode}
                        placeholder="SE21 or SE21 8AE"
                        onChange={(event) => setAvailabilityPostcode(event.target.value)}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group controlId="availability-max-venues-input">
                      <Form.Label>Max venues</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        step={1}
                        value={availabilityMaxVenues}
                        onChange={(event) =>
                          setAvailabilityMaxVenues(event.target.value)
                        }
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group controlId="availability-min-start-time-input">
                      <Form.Label>Min start time</Form.Label>
                      <Form.Select
                        value={availabilityMinStartTime}
                        onChange={(event) =>
                          setAvailabilityMinStartTime(event.target.value)
                        }
                        required
                      >
                        {TIME_SELECT_OPTIONS.map((timeValue) => (
                          <option key={timeValue} value={timeValue}>
                            {timeValue}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group controlId="availability-max-start-time-input">
                      <Form.Label>Max start time</Form.Label>
                      <Form.Select
                        value={availabilityMaxStartTime}
                        onChange={(event) =>
                          setAvailabilityMaxStartTime(event.target.value)
                        }
                        required
                      >
                        {TIME_SELECT_OPTIONS.map((timeValue) => (
                          <option key={timeValue} value={timeValue}>
                            {timeValue}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group controlId="availability-min-end-time-input">
                      <Form.Label>Min end time</Form.Label>
                      <Form.Select
                        value={availabilityMinEndTime}
                        onChange={(event) => setAvailabilityMinEndTime(event.target.value)}
                        required
                      >
                        {TIME_SELECT_OPTIONS.map((timeValue) => (
                          <option key={timeValue} value={timeValue}>
                            {timeValue}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group controlId="availability-max-end-time-input">
                      <Form.Label>Max end time</Form.Label>
                      <Form.Select
                        value={availabilityMaxEndTime}
                        onChange={(event) => setAvailabilityMaxEndTime(event.target.value)}
                        required
                      >
                        {TIME_SELECT_OPTIONS.map((timeValue) => (
                          <option key={timeValue} value={timeValue}>
                            {timeValue}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group controlId="availability-min-length-input">
                      <Form.Label>Min length (mins)</Form.Label>
                      <Form.Select
                        value={availabilityMinLength}
                        onChange={(event) => setAvailabilityMinLength(event.target.value)}
                      >
                        <option value="">Any</option>
                        {MIN_LENGTH_OPTIONS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group>
                      <Form.Label>Request mode</Form.Label>
                      <div className="schedule-mode-toggle">
                        <Form.Check
                          type="radio"
                          id="availability-mode-date"
                          name="availability-mode"
                          label="Date"
                          value="date"
                          checked={availabilityQueryMode === "date"}
                          onChange={(event) =>
                            setAvailabilityQueryMode(event.target.value)
                          }
                        />
                        <Form.Check
                          type="radio"
                          id="availability-mode-n-days"
                          name="availability-mode"
                          label="N days"
                          value="n_days"
                          checked={availabilityQueryMode === "n_days"}
                          onChange={(event) =>
                            setAvailabilityQueryMode(event.target.value)
                          }
                        />
                      </div>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    {availabilityQueryMode === "date" ? (
                      <Form.Group controlId="availability-date-input">
                        <Form.Label>Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={availabilityDate}
                          onChange={(event) => setAvailabilityDate(event.target.value)}
                        />
                      </Form.Group>
                    ) : (
                      <Form.Group controlId="availability-n-days-input">
                        <Form.Label>N days</Form.Label>
                        <Form.Control
                          type="number"
                          min={MIN_N_DAYS}
                          step={1}
                          value={availabilityNDays}
                          onChange={(event) =>
                            setAvailabilityNDays(event.target.value)
                          }
                        />
                      </Form.Group>
                    )}
                  </Col>
                </>
              )}

              <Col md={2} className="d-grid">
                <Button
                  type="submit"
                  disabled={
                    isLoadingVenues ||
                    (searchMode === "schedule" && venues.length === 0) ||
                    isLoadingResults
                  }
                >
                  {isLoadingResults ? "Loading..." : "Go"}
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

      {isLoadingResults ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : null}

      {!isLoadingResults &&
      searchMode === "schedule" &&
      scheduleData &&
      timelineDays.length === 0 ? (
        <Alert variant="secondary" className="mt-3">
          No schedule data was returned for the selected request.
        </Alert>
      ) : null}

      {!isLoadingResults &&
      searchMode === "schedule" &&
      !scheduleData &&
      venues.length > 0 ? (
        <Alert variant="secondary" className="mt-3">
          Choose schedule inputs above and click Go to load the timeline.
        </Alert>
      ) : null}

      {!isLoadingResults &&
      searchMode === "availability" &&
      availabilitySlots === null ? (
        <Alert variant="secondary" className="mt-3">
          Choose availability inputs above and click Go to search across venues.
        </Alert>
      ) : null}

      {!isLoadingResults &&
      searchMode === "availability" &&
      Array.isArray(availabilitySlots) &&
      availabilityGroups.length === 0 ? (
        <Alert variant="secondary" className="mt-3">
          No available slots matched the selected filters.
        </Alert>
      ) : null}

      {!isLoadingResults && currentDay && searchMode === "schedule" ? (
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

      {!isLoadingResults &&
      searchMode === "availability" &&
      availabilityGroups.length > 0 ? (
        <section className="mt-4">
          {availabilityGroups.map((day) => (
            <Card key={day.dateKey} className="surface-card mb-3">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <strong>{formatDayHeading(day.dateKey)}</strong>
                <Badge bg="secondary">{day.slots.length} slots</Badge>
              </Card.Header>
              <ListGroup variant="flush">
                {day.slots.map((slot) => (
                  <ListGroup.Item key={slot.id}>
                    <div className="d-flex justify-content-between flex-wrap gap-2">
                      <div>
                        <strong>{slot.venueName}</strong>
                        <div className="text-muted small">
                          {slot.name || "Court slot"}
                          {slot.courtNumber ? ` · Court ${slot.courtNumber}` : ""}
                        </div>
                      </div>
                      <div className="text-end">
                        <div>
                          {minutesToTime(slot.startTime)} - {minutesToTime(slot.endTime)}
                        </div>
                        <div className="text-muted small">
                          {formatCurrency(slot.cost)} · {formatDistance(slot.distance)}
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
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          ))}
        </section>
      ) : null}
    </Container>
  );
};

export default SchedulePage;
