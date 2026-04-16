import React, { useEffect, useState } from "react";
import { Alert, Container, Spinner } from "react-bootstrap";
import Map from "../components/Map";
import { getVenueAddresses } from "../api";

const MapPage = (props) => {
  const [venues, setVenues] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getVenueAddresses()
      .then((vs) => {
        setVenues(vs);
        setError("");
      })
      .catch((requestError) =>
        setError(requestError.message || "Failed to load venue addresses.")
      )
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Map</h1>
          <p className="page-subtitle">
            Plot the saved venue addresses to quickly jump into Clubspark.
          </p>
        </div>
      </div>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {isLoading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : null}
      <div>
        <Map venues={venues} />
      </div>
    </Container>
  );
};

export default MapPage;
