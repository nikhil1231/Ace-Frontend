import React, { createContext, useContext, useEffect, useState } from "react";

import {
  clearToken as clearStoredToken,
  getBackendOptions,
  getBackendUrl,
  getDefaultBackendUrls,
  readAppSettings,
  setBackendUrls as persistBackendUrls,
  setSelectedEnvironment as persistSelectedEnvironment,
  setToken as persistToken,
  subscribeToSettingsChange,
} from "../util";

const AppSettingsContext = createContext(null);

export const AppSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => readAppSettings());

  useEffect(() => {
    return subscribeToSettingsChange(() => {
      setSettings(readAppSettings());
    });
  }, []);

  const selectedEnvironment = settings.selectedEnvironment;
  const token = settings.tokens[selectedEnvironment] || "";
  const contextValue = {
    settings,
    environments: getBackendOptions(),
    selectedEnvironment,
    backendUrl: getBackendUrl(selectedEnvironment),
    backendUrls: settings.backendUrls,
    defaultBackendUrls: getDefaultBackendUrls(),
    token,
    hasAdminAccess: Boolean(token.trim()),
    setSelectedEnvironment: (environment) =>
      setSettings(persistSelectedEnvironment(environment)),
    setBackendUrls: (backendUrls) => setSettings(persistBackendUrls(backendUrls)),
    setToken: (value, environment = selectedEnvironment) =>
      setSettings(persistToken(value, environment)),
    clearToken: (environment = selectedEnvironment) =>
      setSettings(clearStoredToken(environment)),
  };

  return (
    <AppSettingsContext.Provider value={contextValue}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used within an AppSettingsProvider");
  }

  return context;
};
