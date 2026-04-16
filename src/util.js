const APP_SETTINGS_KEY = "ACE_APP_SETTINGS_V1";
const REQUEST_HISTORY_KEY = "ACE_REQUEST_HISTORY_V1";
const REQUEST_PRESETS_KEY = "ACE_REQUEST_PRESETS_V1";

export const SETTINGS_CHANGE_EVENT = "ace-settings-change";
export const ADMIN_DATA_CHANGE_EVENT = "ace-admin-data-change";
export const DEFAULT_BACKEND_ENVIRONMENT = "local";

const LOCAL_BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL_LOCAL || "http://localhost:8000";
const HOSTED_BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL_HOSTED ||
  process.env.REACT_APP_BACKEND_URL ||
  "https://ace-tennis-9353ae97c95f.herokuapp.com";

export const BACKEND_ENVIRONMENTS = {
  local: {
    key: "local",
    label: "Local",
    url: LOCAL_BACKEND_URL,
  },
  hosted: {
    key: "hosted",
    label: "Hosted",
    url: HOSTED_BACKEND_URL,
  },
};

const DEFAULT_APP_SETTINGS = {
  selectedEnvironment: DEFAULT_BACKEND_ENVIRONMENT,
  tokens: {
    local: "",
    hosted: "",
  },
};

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

const normalizeUrl = (url) => url.replace(/\/+$/, "");

const buildDefaultSettings = () => ({
  selectedEnvironment: DEFAULT_APP_SETTINGS.selectedEnvironment,
  tokens: {
    ...DEFAULT_APP_SETTINGS.tokens,
  },
});

export const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const getToday = () => new Date().toISOString().slice(0, 10);

export const readAppSettings = () => {
  const storedValue = readStoredJson(APP_SETTINGS_KEY, {});
  const selectedEnvironment = BACKEND_ENVIRONMENTS[storedValue.selectedEnvironment]
    ? storedValue.selectedEnvironment
    : DEFAULT_BACKEND_ENVIRONMENT;

  return {
    selectedEnvironment,
    tokens: {
      local: storedValue.tokens?.local || "",
      hosted: storedValue.tokens?.hosted || "",
    },
  };
};

const saveAppSettings = (settings) => {
  writeStoredJson(APP_SETTINGS_KEY, settings);
  emitBrowserEvent(SETTINGS_CHANGE_EVENT);
  return settings;
};

export const getSelectedEnvironment = () => readAppSettings().selectedEnvironment;

export const setSelectedEnvironment = (environment) => {
  const settings = readAppSettings();
  settings.selectedEnvironment = BACKEND_ENVIRONMENTS[environment]
    ? environment
    : DEFAULT_BACKEND_ENVIRONMENT;

  return saveAppSettings(settings);
};

export const getBackendOptions = () => Object.values(BACKEND_ENVIRONMENTS);

export const getBackendUrl = (environment = getSelectedEnvironment()) => {
  const config =
    BACKEND_ENVIRONMENTS[environment] ||
    BACKEND_ENVIRONMENTS[DEFAULT_BACKEND_ENVIRONMENT];

  return normalizeUrl(config.url);
};

export const getToken = (environment = getSelectedEnvironment()) => {
  const settings = readAppSettings();
  return settings.tokens[environment] || "";
};

export const setToken = (token, environment = getSelectedEnvironment()) => {
  const settings = readAppSettings();
  settings.tokens[environment] = token.trim();
  return saveAppSettings(settings);
};

export const clearToken = (environment = getSelectedEnvironment()) => {
  const settings = readAppSettings();
  settings.tokens[environment] = "";
  return saveAppSettings(settings);
};

export const resetAppSettings = () => saveAppSettings(buildDefaultSettings());

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

export const subscribeToSettingsChange = (handler) =>
  subscribeToWindowEvents([SETTINGS_CHANGE_EVENT, "storage"], handler);

const readPresetStore = () => readStoredJson(REQUEST_PRESETS_KEY, {});

const savePresetStore = (value) => {
  writeStoredJson(REQUEST_PRESETS_KEY, value);
  emitBrowserEvent(ADMIN_DATA_CHANGE_EVENT);
};

export const getEndpointPresets = (
  endpointId,
  environment = getSelectedEnvironment()
) => {
  const presets = readPresetStore();
  return presets[environment]?.[endpointId] || [];
};

export const saveEndpointPreset = (
  endpointId,
  name,
  values,
  environment = getSelectedEnvironment()
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
  environment = getSelectedEnvironment()
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

export const getRequestHistory = (environment = getSelectedEnvironment()) => {
  const history = readHistoryStore();
  return history[environment] || [];
};

export const pushRequestHistory = (
  entry,
  environment = getSelectedEnvironment()
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
