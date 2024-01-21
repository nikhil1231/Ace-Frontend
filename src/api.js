import { getToken } from "./util";

export const getBookings = async () => {
  return await _getJson("/booking/bookings");
};

export const getBookingTargets = async () => {
  return await _getJson("/booking/targets");
};

export const getVenueAddresses = async () => {
  return await _getJson("/venues/addresses");
};

export const refreshBookings = async () => {
  await _post("/booking/bookings");
};

export const cancelBooking = async (venue, session_id, username) => {
  await _post(
    "/booking/cancel?" +
      new URLSearchParams({
        venue,
        username,
        session_id,
      })
  );
};

const _getJson = async (path) => {
  const res = await _get(path);
  return await res.json();
};

const _get = async (path) => {
  return await fetch(`${process.env.REACT_APP_BACKEND_URL}${path}`, {
    method: "GET",
    credentials: "include",
  });
};

const _postJson = async (path, body) => {
  const res = await _post(path, body);
  return await res.json();
};

const _post = async (path, json) => {
  const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}${path}`, {
    method: "POST",
    headers: new Headers({
      Authorization: "Bearer " + getToken(),
    }),
    body: JSON.stringify(json),
  });
  if (res.status == 401) {
    alert("Auth failed");
  }
  return res;
};
