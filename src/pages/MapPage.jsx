import React, { useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import Map from "../components/Map";
import { getVenueAddresses } from "../api";

const MapPage = (props) => {
  const [venues, setVenues] = useState({});

  useEffect(() => {
    getVenueAddresses().then((vs) => setVenues(vs));
  }, []);

  return (
    <Container className="mt-5">
      <div>
        <Map venues={venues} />
      </div>
    </Container>
  );
};

export default MapPage;
