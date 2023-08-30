import React from "react";
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

const Map = (props) => {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API,
  });

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={CENTER}
      zoom={MAP_ZOOM}
    >
      {Object.entries(props.venues).map(([venue, address]) => {
        return (
          <MarkerF
            key={venue}
            position={{
              lat: address.Latitude,
              lng: address.Longitude,
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

export default Map;
