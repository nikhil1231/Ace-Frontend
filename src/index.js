import "./index.css";
import "bootstrap/dist/css/bootstrap.min.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";

// The old Settings page kept the backend master password here. It's no longer used: drop it.
try {
  window.localStorage.removeItem("ACE_APP_SETTINGS_V1");
} catch (error) {
  // Storage unavailable (private mode, blocked site data): nothing was stored either.
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
