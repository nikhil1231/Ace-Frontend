export const getBookingTargets = async () => {
  return await _getJson("/booking/targets");
};

export const getVenueAddresses = async () => {
  return await _getJson("/venues/addresses");
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
  return await fetch(`${process.env.REACT_APP_BACKEND_URL}${path}`, {
    method: "POST",
    body: JSON.stringify(json),
  });
};
