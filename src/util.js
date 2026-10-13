const REQUEST_HISTORY_KEY = "ACE_REQUEST_HISTORY_V1";
const REQUEST_PRESETS_KEY = "ACE_REQUEST_PRESETS_V1";
// Presets and history used to be kept per backend environment; there is one backend now.
const STORE_SCOPE = "hosted";

export const ADMIN_DATA_CHANGE_EVENT = "ace-admin-data-change";

// The backend is served by the same origin under /api (nginx proxies it), behind Cloudflare
// Access, so requests carry the Access session cookie and need no token of their own.
export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "/api").replace(/\/+$/, "");

const canUseBrowserStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const emitBrowserEvent = (name) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(name));
  }
};

const readStoredJson = (key, fallbackValue) => {
  if (!canUseBrowserStorage()) {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
};

const writeStoredJson = (key, value) => {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};

export const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const getToday = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const clampDateToToday = (value) => {
  const today = getToday();
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return today;
  }

  return value < today ? today : value;
};

const subscribeToWindowEvents = (events, handler) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  events.forEach((eventName) => window.addEventListener(eventName, handler));

  return () => {
    events.forEach((eventName) =>
      window.removeEventListener(eventName, handler)
    );
  };
};

const readPresetStore = () => readStoredJson(REQUEST_PRESETS_KEY, {});

const savePresetStore = (value) => {
  writeStoredJson(REQUEST_PRESETS_KEY, value);
  emitBrowserEvent(ADMIN_DATA_CHANGE_EVENT);
};

export const getEndpointPresets = (
  endpointId,
  environment = STORE_SCOPE
) => {
  const presets = readPresetStore();
  return presets[environment]?.[endpointId] || [];
};

export const saveEndpointPreset = (
  endpointId,
  name,
  values,
  environment = STORE_SCOPE
) => {
  const presets = readPresetStore();
  const environmentPresets = presets[environment] || {};
  const endpointPresets = environmentPresets[endpointId] || [];

  environmentPresets[endpointId] = [
    {
      id: `${endpointId}-${Date.now()}`,
      name: name?.trim() || `Preset ${endpointPresets.length + 1}`,
      createdAt: new Date().toISOString(),
      values: deepClone(values),
    },
    ...endpointPresets,
  ].slice(0, 10);

  presets[environment] = environmentPresets;
  savePresetStore(presets);
};

export const deleteEndpointPreset = (
  endpointId,
  presetId,
  environment = STORE_SCOPE
) => {
  const presets = readPresetStore();
  const environmentPresets = presets[environment] || {};
  const endpointPresets = environmentPresets[endpointId] || [];

  environmentPresets[endpointId] = endpointPresets.filter(
    (preset) => preset.id !== presetId
  );
  presets[environment] = environmentPresets;
  savePresetStore(presets);
};

const readHistoryStore = () => readStoredJson(REQUEST_HISTORY_KEY, {});

const saveHistoryStore = (value) => {
  writeStoredJson(REQUEST_HISTORY_KEY, value);
  emitBrowserEvent(ADMIN_DATA_CHANGE_EVENT);
};

export const getRequestHistory = (environment = STORE_SCOPE) => {
  const history = readHistoryStore();
  return history[environment] || [];
};

export const pushRequestHistory = (
  entry,
  environment = STORE_SCOPE
) => {
  const history = readHistoryStore();
  const environmentHistory = history[environment] || [];

  history[environment] = [entry, ...environmentHistory].slice(0, 40);
  saveHistoryStore(history);
};

export const subscribeToAdminDataChange = (handler) =>
  subscribeToWindowEvents([ADMIN_DATA_CHANGE_EVENT, "storage"], handler);

export const minutesToTime = (minutes) => {
  if (minutes === null || minutes === undefined || minutes === "") {
    return "";
  }

  const totalMinutes = Number(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  const formattedHours = String(hours).padStart(2, "0");
  const formattedMins = String(mins).padStart(2, "0");

  return `${formattedHours}:${formattedMins}`;
};

export const timeToMinutes = (value) => {
  if (!value) {
    return "";
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export const fdate = (value) => {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleDateString("en-uk", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export const fdatetime = (value) => {
  if (!value) {
    return "Unknown time";
  }

  return new Date(value).toLocaleDateString("en-uk", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
};
