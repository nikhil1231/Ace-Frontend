const op = (method, path) => `${method.toUpperCase()} ${path}`;

export const AUTH_REQUIRED_OPERATIONS = new Set([
  op("PUT", "/venues"),
  op("DELETE", "/venues"),
  op("PUT", "/venues/address"),
  op("PUT", "/venues/borough"),
  op("PUT", "/venues/recently-used"),
  op("DELETE", "/venues/recently-used"),
  op("POST", "/booking/bookings"),
  op("POST", "/booking/book"),
  op("POST", "/booking/login/test"),
  op("POST", "/booking/cancel"),
  op("POST", "/booking/targets/book"),
  op("PUT", "/booking/targets"),
  op("DELETE", "/booking/targets"),
  op("POST", "/booking/targets/clean"),
]);

const BOOKING_TARGET_FIELD_OVERRIDES = {
  "body.Date": {
    type: "date",
    label: "Date",
    colMd: 6,
  },
  "body.StartTime": {
    type: "minutes-time",
    label: "Start time",
    colMd: 4,
  },
  "body.EndTime": {
    type: "minutes-time",
    label: "End time",
    colMd: 4,
  },
  "body.NumCourts": {
    label: "Courts",
    colMd: 2,
    min: 1,
  },
  "body.RecurringWeekly": {
    label: "Recurring weekly",
    colMd: 2,
  },
};

export const ENDPOINT_OVERRIDES = {
  [op("GET", "/schedule")]: {
    title: "Get schedule",
    description: "Fetch the raw venue schedule for one venue.",
    initialValues: {
      "query.date": "__TODAY__",
    },
  },
  [op("GET", "/schedule/availability")]: {
    title: "Find availability",
    description: "Search across venues using the backend availability filters.",
  },
  [op("POST", "/booking/targets/find")]: {
    title: "Find bookable slots",
    description:
      "Use the browser-safe POST endpoint to inspect slots for one booking target.",
    confirm: false,
    fieldOverrides: BOOKING_TARGET_FIELD_OVERRIDES,
    initialValues: {
      "body.Date": "__TODAY__",
      "body.StartTime": 1080,
      "body.EndTime": 1140,
      "body.NumCourts": 1,
      "body.RecurringWeekly": false,
    },
  },
  [op("POST", "/booking/login/test")]: {
    title: "Test Clubspark login",
    description:
      "Run only the login flow for one account and verify the resulting session.",
    confirm: false,
    fieldOverrides: {
      "query.username": {
        label: "Username (optional)",
      },
      "query.use_cached": {
        label: "Use cached session",
      },
    },
    initialValues: {
      "query.use_cached": false,
    },
  },
  [op("POST", "/booking/targets/book")]: {
    title: "Book target manually",
    description: "Attempt to book a specific target immediately.",
    fieldOverrides: BOOKING_TARGET_FIELD_OVERRIDES,
    initialValues: {
      "body.Date": "__TODAY__",
      "body.StartTime": 1080,
      "body.EndTime": 1140,
      "body.NumCourts": 1,
      "body.RecurringWeekly": false,
    },
  },
  [op("PUT", "/booking/targets")]: {
    title: "Add booking target",
    description: "Save a booking target in Redis.",
    fieldOverrides: BOOKING_TARGET_FIELD_OVERRIDES,
    initialValues: {
      "body.Date": "__TODAY__",
      "body.StartTime": 1080,
      "body.EndTime": 1140,
      "body.NumCourts": 1,
      "body.RecurringWeekly": false,
    },
  },
  [op("DELETE", "/booking/targets")]: {
    title: "Remove booking target",
    description: "Delete a booking target from Redis.",
    fieldOverrides: BOOKING_TARGET_FIELD_OVERRIDES,
    initialValues: {
      "body.Date": "__TODAY__",
      "body.StartTime": 1080,
      "body.EndTime": 1140,
      "body.NumCourts": 1,
      "body.RecurringWeekly": false,
    },
  },
  [op("PUT", "/venues/address")]: {
    title: "Set venue address",
    description: "Store the address payload for one venue.",
    fieldOverrides: {
      "body.Latitude": {
        colMd: 4,
        step: "any",
      },
      "body.Longitude": {
        colMd: 4,
        step: "any",
      },
      "body.Postcode": {
        colMd: 4,
      },
    },
  },
};
