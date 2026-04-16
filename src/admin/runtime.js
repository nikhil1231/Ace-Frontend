import { deepClone } from "../util";

export const getValueAtPath = (value, path) =>
  path.split(".").reduce((currentValue, key) => currentValue?.[key], value);

export const setValueAtPath = (value, path, nextValue) => {
  const clone = deepClone(value || {});
  const segments = path.split(".");
  let currentValue = clone;

  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      currentValue[segment] = nextValue;
      return;
    }

    if (!currentValue[segment] || typeof currentValue[segment] !== "object") {
      currentValue[segment] = {};
    }

    currentValue = currentValue[segment];
  });

  return clone;
};

const isBlank = (value) => value === undefined || value === null || value === "";

const coerceNumber = (value, field) => {
  const numericValue =
    field.dataType === "integer" ? Number.parseInt(value, 10) : Number(value);

  if (Number.isNaN(numericValue)) {
    throw new Error(`Invalid number in "${field.label}".`);
  }

  return numericValue;
};

const coerceJson = (value, field) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON in "${field.label}".`);
  }
};

const coerceFieldValue = (field, rawValue) => {
  if (field.type === "checkbox" || field.dataType === "boolean") {
    return Boolean(rawValue);
  }

  if (isBlank(rawValue)) {
    return undefined;
  }

  if (field.dataType === "integer" || field.dataType === "number") {
    return coerceNumber(rawValue, field);
  }

  if (field.dataType === "json") {
    return coerceJson(rawValue, field);
  }

  return rawValue;
};

export const buildInitialValues = (endpoint) =>
  deepClone(endpoint.initialValues || {});

export const buildRequestFromDescriptor = (endpoint, formValues) => {
  const query = {};
  let body;

  (endpoint.fields || []).forEach((field) => {
    const rawValue = getValueAtPath(formValues, field.path);
    const value = coerceFieldValue(field, rawValue);

    if (value === undefined) {
      return;
    }

    if (field.requestLocation === "query") {
      query[field.requestPath] = value;
      return;
    }

    if (field.requestLocation === "body") {
      if (field.requestPath) {
        body = setValueAtPath(body || {}, field.requestPath, value);
      } else {
        body = value;
      }
    }
  });

  return {
    query: Object.keys(query).length > 0 ? query : undefined,
    body,
  };
};
