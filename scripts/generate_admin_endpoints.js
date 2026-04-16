#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const METHOD_ORDER = ["get", "post", "put", "delete", "patch"];
const PROJECT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(PROJECT_ROOT, "..");
const BACKEND_ROOT = path.resolve(REPO_ROOT, "Ace");
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "admin",
  "endpoints.generated.js"
);

const getPrimaryType = (schema = {}) => {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== "null");
  }

  return schema.type;
};

const toLabel = (value = "") =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/\b\w/g, (token) => token.toUpperCase());

const inferSection = (pathName) => {
  if (pathName.startsWith("/schedule")) {
    return "schedule";
  }

  if (pathName.startsWith("/venues")) {
    return "venues";
  }

  if (pathName.startsWith("/booking")) {
    return "bookings";
  }

  return "overview";
};

const endpointId = (method, pathName) => {
  const normalizedPath =
    pathName
      .replace(/^\//, "")
      .replace(/[{}]/g, "")
      .replace(/[\/]/g, "-")
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "root";

  return `${normalizedPath}-${method}`;
};

const schemaUrlFromEnv = () => {
  const configuredSource =
    process.env.ACE_ADMIN_SCHEMA_URL ||
    process.env.REACT_APP_BACKEND_URL_HOSTED ||
    process.env.REACT_APP_BACKEND_URL ||
    "http://localhost:8000";

  if (/\/openapi\.json($|\?)/i.test(configuredSource)) {
    return configuredSource;
  }

  return `${configuredSource.replace(/\/+$/, "")}/openapi.json`;
};

const localSchemaFromPython = () => {
  const script = [
    "import json",
    "import main",
    "print(json.dumps(main.app.openapi()))",
  ].join("\n");

  const env = {
    ...process.env,
    PYTHONPATH: BACKEND_ROOT,
    LOG_LEVEL: process.env.LOG_LEVEL || "INFO",
    BOOKING_RETRY_TIME_MINS: process.env.BOOKING_RETRY_TIME_MINS || "1",
    BOOKING_RETRY_INTERVAL: process.env.BOOKING_RETRY_INTERVAL || "1",
    MASTER_PASSWORD: process.env.MASTER_PASSWORD || "dummy",
    REDIS_HOST: process.env.REDIS_HOST || "localhost",
    REDIS_PORT: process.env.REDIS_PORT || "6379",
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || "dummy",
  };

  const result = spawnSync("python3", ["-c", script], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "python openapi extraction failed");
  }

  return JSON.parse(result.stdout.trim());
};

const dereference = (spec, value, seenRefs = new Set()) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (value.$ref) {
    if (seenRefs.has(value.$ref)) {
      return {};
    }

    const nextSeenRefs = new Set(seenRefs);
    nextSeenRefs.add(value.$ref);
    const pointer = value.$ref.replace(/^#\//, "");
    const target = pointer
      .split("/")
      .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce((currentValue, segment) => currentValue?.[segment], spec);

    return dereference(spec, target, nextSeenRefs);
  }

  if (Array.isArray(value.allOf)) {
    const merged = {
      type: "object",
      properties: {},
      required: [],
    };

    value.allOf.forEach((part) => {
      const resolvedPart = dereference(spec, part, seenRefs);

      if (resolvedPart.type && !merged.type) {
        merged.type = resolvedPart.type;
      }

      if (resolvedPart.properties) {
        merged.properties = {
          ...merged.properties,
          ...resolvedPart.properties,
        };
      }

      if (Array.isArray(resolvedPart.required)) {
        merged.required = Array.from(
          new Set([...merged.required, ...resolvedPart.required])
        );
      }
    });

    return {
      ...value,
      ...merged,
    };
  }

  if (Array.isArray(value.oneOf) && value.oneOf.length > 0) {
    return dereference(spec, value.oneOf[0], seenRefs);
  }

  if (Array.isArray(value.anyOf) && value.anyOf.length > 0) {
    return dereference(spec, value.anyOf[0], seenRefs);
  }

  return value;
};

const buildField = ({
  path,
  requestLocation,
  requestPath,
  label,
  required,
  schema,
}) => {
  const dataType = getPrimaryType(schema) || "string";
  const format = schema.format || null;
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;

  let type = "text";
  let step;

  if (enumValues) {
    type = "select";
  } else if (dataType === "boolean") {
    type = "checkbox";
  } else if (dataType === "integer") {
    type = "number";
    step = 1;
  } else if (dataType === "number") {
    type = "number";
    step = "any";
  } else if (dataType === "string" && format === "date") {
    type = "date";
  } else if (dataType === "string" && format === "date-time") {
    type = "datetime-local";
  } else if (dataType === "array" || dataType === "object") {
    type = "textarea";
  }

  let defaultValue = schema.default;
  if (defaultValue === undefined) {
    defaultValue = type === "checkbox" ? false : "";
  }

  return {
    path,
    requestLocation,
    requestPath,
    label: label || toLabel(path.split(".").slice(-1)[0]),
    type,
    dataType: dataType === "array" || dataType === "object" ? "json" : dataType,
    format,
    enum: enumValues,
    required: Boolean(required),
    defaultValue,
    colMd: type === "textarea" ? 12 : 6,
    step,
  };
};

const setValueAtPath = (value, pathName, nextValue) => {
  const clone = JSON.parse(JSON.stringify(value || {}));
  const segments = pathName.split(".");
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

const buildInitialValues = (fields) =>
  fields.reduce(
    (accumulator, field) =>
      setValueAtPath(accumulator, field.path, field.defaultValue),
    {}
  );

const mergeParameters = (pathParameters = [], operationParameters = []) => {
  const merged = new Map();

  pathParameters.forEach((parameter) => {
    merged.set(`${parameter.in}:${parameter.name}`, parameter);
  });

  operationParameters.forEach((parameter) => {
    merged.set(`${parameter.in}:${parameter.name}`, parameter);
  });

  return [...merged.values()];
};

const queryFields = (spec, pathItem, operation) => {
  const parameters = mergeParameters(pathItem.parameters, operation.parameters);

  return parameters
    .filter((parameter) => parameter.in === "query")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((parameter) => {
      const schema = dereference(spec, parameter.schema || {});

      return buildField({
        path: `query.${parameter.name}`,
        requestLocation: "query",
        requestPath: parameter.name,
        label: schema.title || toLabel(parameter.name),
        required: parameter.required,
        schema,
      });
    });
};

const jsonRequestBodySchema = (spec, operation) => {
  const requestBody = dereference(spec, operation.requestBody);
  if (!requestBody?.content) {
    return null;
  }

  const mediaType =
    requestBody.content["application/json"] ||
    Object.entries(requestBody.content).find(([contentType]) =>
      contentType.includes("json")
    )?.[1];

  if (!mediaType?.schema) {
    return null;
  }

  return dereference(spec, mediaType.schema);
};

const operationHasBody = (spec, operation) => Boolean(jsonRequestBodySchema(spec, operation));

const bodyFieldsFromSchema = (spec, schema, prefix = []) => {
  const resolvedSchema = dereference(spec, schema);
  const schemaType = getPrimaryType(resolvedSchema);

  if ((schemaType === "object" || resolvedSchema.properties) && resolvedSchema.properties) {
    const requiredFields = new Set(resolvedSchema.required || []);

    return Object.entries(resolvedSchema.properties)
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .flatMap(([propertyName, propertySchema]) => {
        const resolvedProperty = dereference(spec, propertySchema);
        const propertyType = getPrimaryType(resolvedProperty);
        const propertyPrefix = [...prefix, propertyName];
        const isNestedObject =
          (propertyType === "object" || resolvedProperty.properties) &&
          resolvedProperty.properties &&
          !resolvedProperty.enum;

        if (isNestedObject) {
          return bodyFieldsFromSchema(spec, resolvedProperty, propertyPrefix);
        }

        return [
          buildField({
            path: `body.${propertyPrefix.join(".")}`,
            requestLocation: "body",
            requestPath: propertyPrefix.join("."),
            label: resolvedProperty.title || toLabel(propertyName),
            required: requiredFields.has(propertyName),
            schema: resolvedProperty,
          }),
        ];
      });
  }

  return [
    buildField({
      path: "body.raw",
      requestLocation: "body",
      requestPath: "",
      label: "Request body (JSON)",
      required: true,
      schema: { type: "object" },
    }),
  ];
};

const bodyFields = (spec, operation) => {
  const bodySchema = jsonRequestBodySchema(spec, operation);

  if (!bodySchema) {
    return [];
  }

  return bodyFieldsFromSchema(spec, bodySchema);
};

const endpointFromOperation = (spec, pathName, method, operation, pathItem) => {
  const fields = [...queryFields(spec, pathItem, operation), ...bodyFields(spec, operation)];
  const operationTitle =
    operation.summary || `${method.toUpperCase()} ${pathName}`;

  return {
    id: endpointId(method, pathName),
    method: method.toUpperCase(),
    path: pathName,
    section: inferSection(pathName),
    title: toLabel(operationTitle),
    description:
      operation.description || operation.summary || `Run ${method.toUpperCase()} ${pathName}.`,
    confirm: method.toUpperCase() !== "GET",
    fields,
    initialValues: buildInitialValues(fields),
  };
};

const generateEndpoints = (spec) => {
  const endpoints = [];

  Object.keys(spec.paths || {})
    .sort()
    .forEach((pathName) => {
      const pathItem = spec.paths[pathName] || {};
      const postHasBody =
        pathItem.post && operationHasBody(spec, pathItem.post);

      METHOD_ORDER.forEach((method) => {
        const operation = pathItem[method];
        if (!operation) {
          return;
        }

        if (
          method === "get" &&
          operationHasBody(spec, operation) &&
          postHasBody
        ) {
          return;
        }

        endpoints.push(endpointFromOperation(spec, pathName, method, operation, pathItem));
      });
    });

  return endpoints;
};

const renderModule = (endpoints) => {
  const payload = JSON.stringify(endpoints, null, 2);

  return [
    "/* eslint-disable */",
    "// This file is auto-generated by scripts/generate_admin_endpoints.js.",
    "// Do not edit by hand.",
    "",
    `export const GENERATED_ENDPOINTS = ${payload};`,
    "",
  ].join("\n");
};

const ensureOutputExists = () => {
  if (fs.existsSync(OUTPUT_PATH)) {
    return;
  }

  const emptyModule = renderModule([]);
  fs.writeFileSync(OUTPUT_PATH, emptyModule, "utf8");
};

const fetchSchema = async (schemaUrl) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(schemaUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const main = async () => {
  const schemaUrl = schemaUrlFromEnv();
  let schema;

  try {
    schema = await fetchSchema(schemaUrl);
    console.log(`[admin:sync] Loaded schema from ${schemaUrl}.`);
  } catch (error) {
    console.warn(
      `[admin:sync] Could not fetch schema from ${schemaUrl}, trying local app import.`
    );
    console.warn(`[admin:sync] Reason: ${error.message}`);

    try {
      schema = localSchemaFromPython();
      console.log("[admin:sync] Loaded schema from local FastAPI app.openapi().");
    } catch (pythonError) {
      ensureOutputExists();
      console.warn(
        "[admin:sync] Could not load schema from local app either. Keeping existing generated endpoints."
      );
      console.warn(`[admin:sync] Reason: ${pythonError.message}`);
      return;
    }
  }

  try {
    const endpoints = generateEndpoints(schema);
    const source = renderModule(endpoints);
    fs.writeFileSync(OUTPUT_PATH, source, "utf8");
    console.log(`[admin:sync] Generated ${endpoints.length} endpoints.`);
  } catch (error) {
    ensureOutputExists();
    console.warn(
      "[admin:sync] Could not generate endpoints from schema. Keeping existing generated endpoints."
    );
    console.warn(`[admin:sync] Reason: ${error.message}`);
  }
};

main();
