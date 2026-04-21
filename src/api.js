import { getBackendUrl, getToken } from "./util";

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

export const buildApiUrl = (path, query = {}, environment) => {
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    const normalizedValue = normalizeQueryValue(value);
    if (normalizedValue !== null) {
      searchParams.append(key, normalizedValue);
    }
  });

  const queryString = searchParams.toString();
  const baseUrl = getBackendUrl(environment);

  return `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
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
  requiresAuth = false,
  environment,
}) => {
  const startedAt = performance.now();
  const url = buildApiUrl(path, query, environment);
  const headers = new Headers({
    Accept: "application/json",
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (requiresAuth) {
    const token = getToken(environment);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

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

export const getVenues = async () => requestJson({ path: "/venues" });

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

export const getVenueAddresses = async () =>
  requestJson({ path: "/venues/addresses" });

export const refreshBookings = async () =>
  requestJson({
    method: "POST",
    path: "/booking/bookings",
    requiresAuth: true,
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
    requiresAuth: true,
  });
