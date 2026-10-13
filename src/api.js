import { API_BASE_URL } from "./util";

// Cloudflare Access answers an expired session with a redirect to its login page. Fetches
// don't follow it (redirect: "manual"), so it shows up as an opaque redirect instead.
const SESSION_EXPIRED_MESSAGE =
  "Your sign-in has expired. Reload the page to sign in again.";

const isAccessRedirect = (response) => response.type === "opaqueredirect";

const extractErrorMessage = (payload, fallback = "Request failed") => {
  if (!payload) {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  return fallback;
};

const normalizeQueryValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
};

export const buildApiUrl = (path, query = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    const normalizedValue = normalizeQueryValue(value);
    if (normalizedValue !== null) {
      searchParams.append(key, normalizedValue);
    }
  });

  const queryString = searchParams.toString();
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
};

const parseResponsePayload = async (response) => {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    return rawText;
  }
};

export const requestApi = async ({
  method = "GET",
  path,
  query = {},
  body,
}) => {
  const startedAt = performance.now();
  const url = buildApiUrl(path, query);
  const headers = new Headers({
    Accept: "application/json",
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    if (isAccessRedirect(response)) {
      return {
        ok: false,
        status: 401,
        statusText: "Signed out",
        durationMs: Math.round(performance.now() - startedAt),
        data: null,
        error: SESSION_EXPIRED_MESSAGE,
        payload: null,
        url,
        method,
      };
    }

    const payload = await parseResponsePayload(response);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      data: response.ok ? payload : null,
      error: response.ok
        ? null
        : extractErrorMessage(payload, response.statusText || "Request failed"),
      payload,
      url,
      method,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: "Network Error",
      durationMs: Math.round(performance.now() - startedAt),
      data: null,
      error: error.message || "Network request failed",
      payload: null,
      url,
      method,
    };
  }
};

export const requestJson = async (options) => {
  const result = await requestApi(options);

  if (!result.ok) {
    throw new Error(result.error || "Request failed");
  }

  return result.data;
};

export const getBookings = async () => requestJson({ path: "/booking/bookings" });

export const getBookingTargets = async () =>
  requestJson({ path: "/booking/targets" });

export const putBookingTarget = async (bookingTarget) => {
  if (!bookingTarget || typeof bookingTarget !== "object") {
    throw new Error("Booking target payload is required.");
  }

  return requestJson({
    method: "PUT",
    path: "/booking/targets",
    body: bookingTarget,
  });
};

export const deleteBookingTarget = async (bookingTarget) => {
  if (!bookingTarget || typeof bookingTarget !== "object") {
    throw new Error("Booking target payload is required.");
  }

  return requestJson({
    method: "DELETE",
    path: "/booking/targets",
    body: bookingTarget,
  });
};

export const bookTargets = async () =>
  requestJson({
    method: "POST",
    path: "/booking/book",
  });

export const bookTargetNow = async (bookingTarget, { dryRun = true } = {}) => {
  if (!bookingTarget || typeof bookingTarget !== "object") {
    throw new Error("Booking target payload is required.");
  }

  return requestJson({
    method: "POST",
    path: "/booking/targets/book",
    query: {
      dry_run: Boolean(dryRun),
    },
    body: bookingTarget,
  });
};

export const findBookableSlots = async (bookingTarget) => {
  if (!bookingTarget || typeof bookingTarget !== "object") {
    throw new Error("Booking target payload is required.");
  }

  return requestJson({
    method: "POST",
    path: "/booking/targets/find",
    body: bookingTarget,
  });
};

export const cleanBookingTargets = async () =>
  requestJson({
    method: "POST",
    path: "/booking/targets/clean",
  });

export const getMonitorStatus = async () =>
  requestJson({
    path: "/monitor/status",
  });

export const getVenues = async () => requestJson({ path: "/venues" });

export const getVenueName = async (venue) =>
  requestJson({
    path: "/venues/name",
    query: {
      venue,
    },
  });

export const getVenueAddress = async (venue) =>
  requestJson({
    path: "/venues/address",
    query: {
      venue,
    },
  });

export const getVenueSettings = async (venue) =>
  requestJson({
    path: "/venues/settings",
    query: {
      venue,
    },
  });

export const getRecentlyUsedVenues = async () =>
  requestJson({ path: "/venues/recently-used" });

export const getSchedule = async ({ venue, date, nDays }) => {
  const hasDate = date !== undefined && date !== null && date !== "";
  const hasNDays = nDays !== undefined && nDays !== null && nDays !== "";

  if (!venue) {
    throw new Error("Venue is required.");
  }

  if ((hasDate && hasNDays) || (!hasDate && !hasNDays)) {
    throw new Error("Provide either date or n_days, but not both.");
  }

  return requestJson({
    path: "/schedule",
    query: {
      venue,
      date: hasDate ? date : undefined,
      n_days: hasNDays ? nDays : undefined,
    },
  });
};

export const getAvailability = async ({
  postcode,
  maxVenues = 50,
  date,
  nDays,
  minStartTime,
  maxStartTime,
  minEndTime,
  maxEndTime,
  minLength,
}) => {
  const hasDate = date !== undefined && date !== null && date !== "";
  const hasNDays = nDays !== undefined && nDays !== null && nDays !== "";
  const parsedMaxVenues = Number.parseInt(maxVenues, 10);

  if (!postcode || String(postcode).trim().length === 0) {
    throw new Error("Postcode or outcode is required.");
  }

  if (!Number.isInteger(parsedMaxVenues) || parsedMaxVenues < 1) {
    throw new Error("Max venues must be an integer greater than or equal to 1.");
  }

  if ((hasDate && hasNDays) || (!hasDate && !hasNDays)) {
    throw new Error("Provide either date or n_days, but not both.");
  }

  return requestJson({
    path: "/schedule/availability",
    query: {
      postcode: String(postcode).trim(),
      max_venues: parsedMaxVenues,
      date: hasDate ? date : undefined,
      n_days: hasNDays ? nDays : undefined,
      min_start_time: minStartTime,
      max_start_time: maxStartTime,
      min_end_time: minEndTime,
      max_end_time: maxEndTime,
      min_length: minLength,
    },
  });
};

export const getVenueAddresses = async () =>
  requestJson({ path: "/venues/addresses" });

export const refreshBookings = async () =>
  requestJson({
    method: "POST",
    path: "/booking/bookings",
  });

export const cancelBooking = async (venue, sessionId, username) =>
  requestJson({
    method: "POST",
    path: "/booking/cancel",
    query: {
      venue,
      username,
      session_id: sessionId,
    },
  });

export const getMe = async () => requestJson({ path: "/me" });

export const checkAdminAuth = async () =>
  requestJson({
    path: "/admin/auth/check",
  });

export const getLogSources = async () =>
  requestJson({
    path: "/logs/sources",
  });

export const getLogTail = async ({ source, lines } = {}) =>
  requestJson({
    path: "/logs/tail",
    query: {
      source,
      lines,
    },
  });

export const streamLogFollow = async ({
  source,
  lines,
  signal,
  onEvent,
}) => {
  const url = buildApiUrl("/logs/follow", {
    source,
    lines,
  });
  const headers = new Headers({
    Accept: "application/x-ndjson",
  });

  const response = await fetch(url, {
    headers,
    signal,
    redirect: "manual",
  });

  if (isAccessRedirect(response)) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  if (!response.ok) {
    const payload = await parseResponsePayload(response);
    throw new Error(
      extractErrorMessage(payload, response.statusText || "Request failed")
    );
  }

  if (!response.body) {
    throw new Error("Streaming responses are not supported by this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    lines.forEach((line) => {
      if (!line.trim()) {
        return;
      }

      onEvent(JSON.parse(line));
    });
  }

  const remaining = `${buffer}${decoder.decode()}`.trim();
  if (remaining) {
    onEvent(JSON.parse(remaining));
  }
};
