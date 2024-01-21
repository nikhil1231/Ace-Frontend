import React, { useEffect, useState } from "react";
import { Container } from "react-bootstrap";

import { setToken } from "../util";

const SettingsPage = () => {
  const [token, setTokenValue] = useState("");

  return (
    <Container className="mt-5">
      <h2>Settings</h2>
      <input
        value={token}
        onChange={(e) => setTokenValue(e.target.value)}
        placeholder={"Auth token"}
      ></input>
      <button onClick={() => setToken(token)}>Set</button>
    </Container>
  );
};

export default SettingsPage;
