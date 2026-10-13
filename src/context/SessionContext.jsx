import React, { createContext, useContext, useEffect, useState } from "react";

import { getMe } from "../api";

// Who is signed in, as the backend sees it. Cloudflare Access does the signing in; the
// backend verifies its token and answers /me. isAdmin only decides what the UI shows:
// the backend enforces admin on every admin endpoint regardless.
const SessionContext = createContext(null);

export const SessionProvider = ({ children }) => {
  const [session, setSession] = useState({
    email: "",
    isAdmin: false,
    isLoading: true,
    error: "",
  });

  useEffect(() => {
    let isActive = true;

    getMe()
      .then((me) => {
        if (isActive) {
          setSession({
            email: me?.email || "",
            isAdmin: Boolean(me?.admin),
            isLoading: false,
            error: "",
          });
        }
      })
      .catch((error) => {
        if (isActive) {
          setSession({
            email: "",
            isAdmin: false,
            isLoading: false,
            error: error.message || "Could not load your session.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }

  return context;
};
