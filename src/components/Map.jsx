import React from "react";
import { Alert } from "react-bootstrap";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";

const CENTER = {
  lat: 51.5022282,
  lng: -0.1052267,
};

const MAP_ZOOM = 12;
const cbURL = (v) => `https://clubspark.lta.org.uk/${v}/Booking/BookByDate`;

const containerStyle = {
  width: "100%",
  height: "500px",
};

const toCoordinate = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const LoadedMap = ({ apiKey, venueMarkers }) => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
  });

  if (loadError) {
    return (
      <Alert variant="danger" className="mb-0">
        Google Maps failed to load. Please check your API key and allowed
        referrers/project settings in Google Cloud.
      </Alert>
    );
  }

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={CENTER}
      zoom={MAP_ZOOM}
    >
      {venueMarkers.map(({ venue, lat, lng }) => {
        return (
          <MarkerF
            key={venue}
            position={{
              lat,
              lng,
            }}
            onClick={() => window.open(cbURL(venue))}
          />
        );
      })}
    </GoogleMap>
  ) : (
    <></>
  );
};

const Map = (props) => {
  const apiKey = String(process.env.REACT_APP_GOOGLE_MAPS_API || "").trim();
  const venueMarkers = Object.entries(props.venues || {}).reduce(
    (accumulator, [venue, address]) => {
      if (!address || typeof address !== "object") {
        return accumulator;
      }

      const latitude = toCoordinate(address.Latitude);
      const longitude = toCoordinate(address.Longitude);

      if (latitude === null || longitude === null) {
        return accumulator;
      }

      accumulator.push({
        venue,
        lat: latitude,
        lng: longitude,
      });

      return accumulator;
    },
    []
  );

  if (!apiKey) {
    return (
      <Alert variant="warning" className="mb-0">
        Google Maps is not configured. Set <code>REACT_APP_GOOGLE_MAPS_API</code>{" "}
        and restart the frontend.
      </Alert>
    );
  }

  return <LoadedMap apiKey={apiKey} venueMarkers={venueMarkers} />;
};

export default Map;
