import { deepClone, getToday } from "../util";
import { setValueAtPath } from "./runtime";
import { GENERATED_ENDPOINTS } from "./endpoints.generated";
import {
  AUTH_REQUIRED_OPERATIONS,
  ENDPOINT_OVERRIDES,
} from "./endpoints.overrides";

export const ADMIN_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    description: "Backend status, diagnostics, and recent activity.",
  },
  {
    key: "schedule",
    label: "Schedule",
    description: "Inspect schedules and availability across venues.",
  },
  {
    key: "venues",
    label: "Venues",
    description: "Manage saved venues, names, addresses, and related metadata.",
  },
  {
    key: "bookings",
    label: "Bookings",
    description: "Review bookings, manage targets, and trigger booking actions.",
  },
];

const SECTION_ORDER = ADMIN_SECTIONS.map((section) => section.key);

const operationKey = ({ method, path }) => `${method.toUpperCase()} ${path}`;

const inferSection = (path) => {
  if (path.startsWith("/schedule")) {
    return "schedule";
  }

  if (path.startsWith("/venues")) {
    return "venues";
  }

  if (path.startsWith("/booking")) {
    return "bookings";
  }

  return "overview";
};

const normalizeSection = (path, section) => {
  if (SECTION_ORDER.includes(section)) {
    return section;
  }

  return inferSection(path);
};

const resolveDynamicValue = (value) => {
  if (value === "__TODAY__") {
    return getToday();
  }

  if (Array.isArray(value)) {
    return value.map(resolveDynamicValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        resolveDynamicValue(nestedValue),
      ])
    );
  }

  return value;
};

const applyFieldOverrides = (fields, fieldOverrides = {}) =>
  fields.map((field) => ({
    ...field,
    ...(fieldOverrides[field.path] || {}),
  }));

const applyInitialValueOverrides = (initialValues, overrideInitialValues = {}) => {
  let mergedValues = deepClone(initialValues);

  Object.entries(overrideInitialValues).forEach(([path, value]) => {
    mergedValues = setValueAtPath(mergedValues, path, resolveDynamicValue(value));
  });

  return resolveDynamicValue(mergedValues);
};

const bySectionPathMethod = (a, b) => {
  const aSectionIndex = SECTION_ORDER.indexOf(a.section);
  const bSectionIndex = SECTION_ORDER.indexOf(b.section);

  if (aSectionIndex !== bSectionIndex) {
    return aSectionIndex - bSectionIndex;
  }

  if (a.path !== b.path) {
    return a.path.localeCompare(b.path);
  }

  return a.method.localeCompare(b.method);
};

export const ADMIN_ENDPOINTS = GENERATED_ENDPOINTS.map((endpoint) => {
  const key = operationKey(endpoint);
  const override = ENDPOINT_OVERRIDES[key] || {};
  const fieldOverrides = override.fieldOverrides || {};
  const initialValueOverrides = override.initialValues || {};
  const fields = applyFieldOverrides(endpoint.fields || [], fieldOverrides);
  const initialValues = applyInitialValueOverrides(
    endpoint.initialValues || {},
    initialValueOverrides
  );

  return {
    ...endpoint,
    title: override.title || endpoint.title,
    description: override.description || endpoint.description,
    section: normalizeSection(endpoint.path, override.section || endpoint.section),
    requiresAuth:
      override.requiresAuth === undefined
        ? AUTH_REQUIRED_OPERATIONS.has(key)
        : override.requiresAuth,
    confirm:
      override.confirm === undefined
        ? endpoint.confirm ?? endpoint.method !== "GET"
        : override.confirm,
    fields,
    initialValues,
  };
}).sort(bySectionPathMethod);
