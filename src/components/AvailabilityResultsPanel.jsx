import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Spinner } from "react-bootstrap";
import {
  GoogleMap,
  InfoWindowF,
  MarkerF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";

import { getVenueAddresses } from "../api";
import { minutesToTime } from "../util";

const TIME_MARK_INTERVAL = 30;
const TIME_LABEL_INTERVAL = 60;
const PIXELS_PER_MINUTE = 2;
const FALLBACK_DAY_START = 7 * 60;
const FALLBACK_DAY_END = 22 * 60;
const TRACK_MIN_WIDTH = 420;
const HOVER_CLEAR_DELAY_MS = 120;
const MAP_CONTAINER_STYLE = {
  width: "100%",
  height: "460px",
};
const MAP_FALLBACK_CENTER = {
  lat: 51.5074,
  lng: -0.1278,
};

const normalizeDateKey = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.split("T")[0];
};

const parseDateKey = (dateKey) => {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDayHeading = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) {
    return dateKey;
  }

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatCurrency = (amount) => {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "Price unavailable";
  }

  return `\u00A3${amount.toFixed(2)}`;
};

const formatCurrencyRange = (minCost, maxCost) => {
  if (
    typeof minCost !== "number" ||
    Number.isNaN(minCost) ||
    typeof maxCost !== "number" ||
    Number.isNaN(maxCost)
  ) {
    return "Price unavailable";
  }

  if (Math.abs(minCost - maxCost) < 0.001) {
    return formatCurrency(minCost);
  }

  return `${formatCurrency(minCost)} - ${formatCurrency(maxCost)}`;
};

const formatDistance = (distance) => {
  if (typeof distance !== "number" || Number.isNaN(distance)) {
    return "Distance unavailable";
  }

  return `${distance.toFixed(1)} km`;
};

const toCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildTimeMarks = (startTime, endTime, interval) => {
  const marks = [];
  for (let minute = startTime; minute <= endTime; minute += interval) {
    marks.push(minute);
  }
  return marks;
};

const parseAvailabilitySlot = (slot, index) => {
  const dateKey = normalizeDateKey(slot?.Date);
  if (!dateKey) {
    return null;
  }

  const parsedStartTime = Number(slot?.StartTime);
  const parsedEndTime = Number(slot?.EndTime);
  const parsedDistance = Number(slot?.Distance);

  const startTime = Number.isFinite(parsedStartTime) ? parsedStartTime : 0;
  const endTime = Number.isFinite(parsedEndTime) ? parsedEndTime : startTime;
  if (endTime <= startTime) {
    return null;
  }

  const venue =
    typeof slot?.Venue === "string" && slot.Venue.trim().length > 0
      ? slot.Venue
      : "";
  const venueName =
    typeof slot?.VenueName === "string" && slot.VenueName.trim().length > 0
      ? slot.VenueName
      : venue || "Unknown venue";

  const resourceId =
    typeof slot?.ResourceID === "string" && slot.ResourceID.trim().length > 0
      ? slot.ResourceID
      : null;
  const courtNumber =
    typeof slot?.CourtNumber === "number" && Number.isFinite(slot.CourtNumber)
      ? slot.CourtNumber
      : null;
  const cost =
    typeof slot?.Cost === "number" && Number.isFinite(slot.Cost) ? slot.Cost : null;
  const distance = Number.isFinite(parsedDistance) ? parsedDistance : null;

  return {
    id: `${dateKey}-${venue || "venue"}-${slot?.SessionID || "session"}-${index}`,
    dateKey,
    venue,
    venueName,
    startTime,
    endTime,
    resourceId,
    courtNumber,
    name: slot?.Name || "",
    cost,
    distance,
    bookingLink: slot?.BookingLink || null,
  };
};

const buildAvailabilityDays = (slots) => {
  if (!Array.isArray(slots)) {
    return [];
  }

  const dayMap = new Map();

  slots.forEach((slot, index) => {
    const parsedSlot = parseAvailabilitySlot(slot, index);
    if (!parsedSlot) {
      return;
    }

    if (!dayMap.has(parsedSlot.dateKey)) {
      dayMap.set(parsedSlot.dateKey, new Map());
    }

    const dayVenueMap = dayMap.get(parsedSlot.dateKey);
    const venueKey = parsedSlot.venue || parsedSlot.venueName;

    if (!dayVenueMap.has(venueKey)) {
      dayVenueMap.set(venueKey, {
        venue: parsedSlot.venue,
        venueKey,
        venueName: parsedSlot.venueName,
        blocks: new Map(),
      });
    }

    const venueEntry = dayVenueMap.get(venueKey);
    const blockKey = `${parsedSlot.startTime}-${parsedSlot.endTime}`;

    if (!venueEntry.blocks.has(blockKey)) {
      venueEntry.blocks.set(blockKey, {
        startTime: parsedSlot.startTime,
        endTime: parsedSlot.endTime,
        slots: [],
      });
    }

    venueEntry.blocks.get(blockKey).slots.push(parsedSlot);
  });

  return [...dayMap.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([dateKey, venueMap]) => {
      const venues = [...venueMap.values()]
        .map((venueEntry) => {
          const blocks = [...venueEntry.blocks.values()]
            .map((block) => {
              const distanceValues = block.slots
                .map((slot) => slot.distance)
                .filter((distance) => typeof distance === "number");
              const costValues = block.slots
                .map((slot) => slot.cost)
                .filter((cost) => typeof cost === "number");
              const courtIds = new Set(
                block.slots.map((slot) => slot.resourceId || slot.courtNumber || slot.id)
              );
              const courtNumbers = [...new Set(
                block.slots
                  .map((slot) => slot.courtNumber)
                  .filter((value) => value !== null)
              )].sort((first, second) => first - second);
              const names = [...new Set(
                block.slots
                  .map((slot) => slot.name)
                  .filter((value) => typeof value === "string" && value.trim().length > 0)
              )];

              return {
                id: `${venueEntry.venueKey}-${dateKey}-${block.startTime}-${block.endTime}`,
                startTime: block.startTime,
                endTime: block.endTime,
                courtCount: Math.max(courtIds.size, block.slots.length),
                minCost: costValues.length > 0 ? Math.min(...costValues) : null,
                maxCost: costValues.length > 0 ? Math.max(...costValues) : null,
                distance:
                  distanceValues.length > 0 ? Math.min(...distanceValues) : null,
                bookingLink:
                  block.slots.find((slot) => slot.bookingLink)?.bookingLink || null,
                courtNumbers,
                names,
                slots: block.slots,
              };
            })
            .sort(
              (first, second) =>
                first.startTime - second.startTime || first.endTime - second.endTime
            );

          const blockDistances = blocks
            .map((block) => block.distance)
            .filter((distance) => typeof distance === "number");

          return {
            venue: venueEntry.venue,
            venueKey: venueEntry.venueKey,
            venueName: venueEntry.venueName,
            distance:
              blockDistances.length > 0 ? Math.min(...blockDistances) : null,
            blocks,
          };
        })
        .sort((first, second) => {
          const firstDistance =
            first.distance === null ? Number.POSITIVE_INFINITY : first.distance;
          const secondDistance =
            second.distance === null ? Number.POSITIVE_INFINITY : second.distance;

          return firstDistance - secondDistance || first.venueName.localeCompare(second.venueName);
        });

      return {
        dateKey,
        venues,
      };
    });
};

const summarizeVenuesAcrossDays = (availabilityDays) => {
  const venueSummaryMap = new Map();

  availabilityDays.forEach((day) => {
    day.venues.forEach((venue) => {
      if (!venueSummaryMap.has(venue.venueKey)) {
        venueSummaryMap.set(venue.venueKey, {
          venue: venue.venue,
          venueKey: venue.venueKey,
          venueName: venue.venueName,
          minDistance: venue.distance,
          totalBlocks: 0,
          totalCourts: 0,
          nextSlotStart: null,
          nextSlotEnd: null,
        });
      }

      const summary = venueSummaryMap.get(venue.venueKey);
      summary.totalBlocks += venue.blocks.length;
      summary.totalCourts += venue.blocks.reduce(
        (total, block) => total + block.courtCount,
        0
      );

      if (typeof venue.distance === "number") {
        if (summary.minDistance === null || venue.distance < summary.minDistance) {
          summary.minDistance = venue.distance;
        }
      }

      venue.blocks.forEach((block) => {
        if (summary.nextSlotStart === null || block.startTime < summary.nextSlotStart) {
          summary.nextSlotStart = block.startTime;
          summary.nextSlotEnd = block.endTime;
        }
      });
    });
  });

  return [...venueSummaryMap.values()].sort((first, second) => {
    const firstDistance =
      first.minDistance === null ? Number.POSITIVE_INFINITY : first.minDistance;
    const secondDistance =
      second.minDistance === null ? Number.POSITIVE_INFINITY : second.minDistance;

    return firstDistance - secondDistance || first.venueName.localeCompare(second.venueName);
  });
};

const getVenueMarkerIcon = (isHighlighted, isFocused) => {
  if (typeof window === "undefined" || !window.google?.maps?.SymbolPath) {
    return undefined;
  }

  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: isFocused ? 9 : isHighlighted ? 8 : 6.5,
    fillColor: isFocused ? "#0f172a" : isHighlighted ? "#1d4ed8" : "#2563eb",
    fillOpacity: 0.95,
    strokeColor: "#ffffff",
    strokeWeight: 1.5,
  };
};

const resolveSearchLocation = async (postcodeOrOutcode) => {
  const normalizedValue = String(postcodeOrOutcode || "").trim().toUpperCase();
  if (!normalizedValue) {
    return null;
  }

  const compactValue = normalizedValue.replace(/\s+/g, "");
  const endpoint = compactValue.length >= 5
    ? `https://api.postcodes.io/postcodes/${encodeURIComponent(normalizedValue)}`
    : `https://api.postcodes.io/outcodes/${encodeURIComponent(compactValue)}`;

  const response = await fetch(endpoint, { method: "GET" });
  if (!response.ok) {
    throw new Error("Failed to resolve searched location.");
  }

  const payload = await response.json();
  const latitude = Number(payload?.result?.latitude);
  const longitude = Number(payload?.result?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Searched location did not include coordinates.");
  }

  return {
    label: normalizedValue,
    lat: latitude,
    lng: longitude,
  };
};

const AvailabilityResultsPanel = ({ slots, searchPostcode }) => {
  const navigate = useNavigate();
  const apiKey = String(process.env.REACT_APP_GOOGLE_MAPS_API || "").trim();
  const availabilityDays = useMemo(() => buildAvailabilityDays(slots), [slots]);
  const venueSummaries = useMemo(() => summarizeVenuesAcrossDays(availabilityDays), [availabilityDays]);

  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [focusedVenueKey, setFocusedVenueKey] = useState("");
  const [hoveredVenueKey, setHoveredVenueKey] = useState("");
  const [selectedBlock, setSelectedBlock] = useState(null);

  const [venueAddressMap, setVenueAddressMap] = useState({});
  const [venueAddressWarning, setVenueAddressWarning] = useState("");
  const [searchLocation, setSearchLocation] = useState(null);
  const [searchLocationWarning, setSearchLocationWarning] = useState("");
  const [mapInstance, setMapInstance] = useState(null);
  const hoveredVenueClearTimerRef = useRef(null);

  const { isLoaded: isMapLoaded, loadError: mapLoadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
  });

  const setHoveredVenue = (venueKey) => {
    if (hoveredVenueClearTimerRef.current) {
      window.clearTimeout(hoveredVenueClearTimerRef.current);
      hoveredVenueClearTimerRef.current = null;
    }
    setHoveredVenueKey(venueKey);
  };

  const clearHoveredVenue = () => {
    if (hoveredVenueClearTimerRef.current) {
      window.clearTimeout(hoveredVenueClearTimerRef.current);
    }
    hoveredVenueClearTimerRef.current = window.setTimeout(() => {
      setHoveredVenueKey("");
      hoveredVenueClearTimerRef.current = null;
    }, HOVER_CLEAR_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (hoveredVenueClearTimerRef.current) {
        window.clearTimeout(hoveredVenueClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedDayIndex(0);
    setFocusedVenueKey("");
    setHoveredVenueKey("");
    setSelectedBlock(null);
  }, [slots]);

  useEffect(() => {
    let isCancelled = false;

    if (!Array.isArray(slots) || slots.length === 0) {
      setVenueAddressMap({});
      setVenueAddressWarning("");
      return () => {
        isCancelled = true;
      };
    }

    const loadVenueAddresses = async () => {
      try {
        const nextAddresses = await getVenueAddresses();
        if (isCancelled) {
          return;
        }

        setVenueAddressMap(
          nextAddresses && typeof nextAddresses === "object" ? nextAddresses : {}
        );
        setVenueAddressWarning("");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setVenueAddressMap({});
        setVenueAddressWarning(
          "Could not load all venue coordinates. Map pins may be incomplete."
        );
      }
    };

    loadVenueAddresses();

    return () => {
      isCancelled = true;
    };
  }, [slots]);

  useEffect(() => {
    let isCancelled = false;

    const normalizedValue = String(searchPostcode || "").trim();
    if (!normalizedValue) {
      setSearchLocation(null);
      setSearchLocationWarning("");
      return () => {
        isCancelled = true;
      };
    }

    const geocode = async () => {
      try {
        const nextLocation = await resolveSearchLocation(normalizedValue);
        if (isCancelled) {
          return;
        }

        setSearchLocation(nextLocation);
        setSearchLocationWarning("");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSearchLocation(null);
        setSearchLocationWarning(
          "Could not resolve the searched location marker. Showing venue pins only."
        );
      }
    };

    geocode();

    return () => {
      isCancelled = true;
    };
  }, [searchPostcode]);

  const currentDay = availabilityDays[selectedDayIndex] || null;
  const canGoNextDay = selectedDayIndex < availabilityDays.length - 1;
  const canGoPrevDay = selectedDayIndex > 0;

  const visibleVenues = useMemo(() => {
    if (!currentDay) {
      return [];
    }

    if (!focusedVenueKey) {
      return currentDay.venues;
    }

    return currentDay.venues.filter((venue) => venue.venueKey === focusedVenueKey);
  }, [currentDay, focusedVenueKey]);

  const hasVisibleFocusedVenue = useMemo(
    () => visibleVenues.some((venue) => venue.venueKey === focusedVenueKey),
    [visibleVenues, focusedVenueKey]
  );

  useEffect(() => {
    if (focusedVenueKey && !hasVisibleFocusedVenue) {
      setFocusedVenueKey("");
    }
  }, [focusedVenueKey, hasVisibleFocusedVenue]);

  const dayBounds = useMemo(() => {
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;

    visibleVenues.forEach((venue) => {
      venue.blocks.forEach((block) => {
        if (block.startTime < minStart) {
          minStart = block.startTime;
        }
        if (block.endTime > maxEnd) {
          maxEnd = block.endTime;
        }
      });
    });

    const normalizedMin = Number.isFinite(minStart) ? minStart : FALLBACK_DAY_START;
    const normalizedMax = Number.isFinite(maxEnd) ? maxEnd : FALLBACK_DAY_END;

    return {
      windowStart:
        Math.floor(normalizedMin / TIME_MARK_INTERVAL) * TIME_MARK_INTERVAL,
      windowEnd: Math.max(
        Math.ceil(normalizedMax / TIME_MARK_INTERVAL) * TIME_MARK_INTERVAL,
        Math.floor(normalizedMin / TIME_MARK_INTERVAL) * TIME_MARK_INTERVAL +
          TIME_MARK_INTERVAL
      ),
    };
  }, [visibleVenues]);

  const timelineWidth = Math.max(
    (dayBounds.windowEnd - dayBounds.windowStart) * PIXELS_PER_MINUTE,
    TRACK_MIN_WIDTH
  );
  const timeMarks = useMemo(
    () => buildTimeMarks(dayBounds.windowStart, dayBounds.windowEnd, TIME_LABEL_INTERVAL),
    [dayBounds.windowStart, dayBounds.windowEnd]
  );

  const blockLookup = useMemo(() => {
    const map = new Map();
    visibleVenues.forEach((venue) => {
      venue.blocks.forEach((block) => {
        map.set(`${venue.venueKey}::${block.id}`, {
          ...block,
          dateKey: currentDay?.dateKey || "",
          venue: venue.venue,
          venueKey: venue.venueKey,
          venueName: venue.venueName,
          venueDistance: venue.distance,
        });
      });
    });
    return map;
  }, [currentDay?.dateKey, visibleVenues]);

  const selectedBlockDetails = useMemo(() => {
    if (!selectedBlock) {
      return null;
    }

    return blockLookup.get(`${selectedBlock.venueKey}::${selectedBlock.blockId}`) || null;
  }, [selectedBlock, blockLookup]);

  const handleSendToTargetActions = () => {
    if (!selectedBlockDetails) {
      return;
    }

    const slotOptions = selectedBlockDetails.slots.map((slot, index) => ({
      Venue: selectedBlockDetails.venue || selectedBlockDetails.venueKey,
      VenueName: selectedBlockDetails.venueName,
      Name: slot.name || "Court slot",
      Date: selectedBlockDetails.dateKey,
      StartTime: selectedBlockDetails.startTime,
      EndTime: selectedBlockDetails.endTime,
      CourtNumber: slot.courtNumber,
      Cost: slot.cost,
      BookingLink: slot.bookingLink || "",
      SessionID: `${selectedBlockDetails.venueKey}-${selectedBlockDetails.blockId}-${index}`,
    }));

    navigate("/", {
      state: {
        targetActionPrefill: {
          venue: selectedBlockDetails.venue || "",
          date: selectedBlockDetails.dateKey,
          startTime: minutesToTime(selectedBlockDetails.startTime),
          endTime: minutesToTime(selectedBlockDetails.endTime),
          numCourts: String(Math.max(1, selectedBlockDetails.courtCount)),
          recurringWeekly: false,
          slotOptions,
        },
      },
    });
  };

  const markerSummaries = useMemo(() => {
    const dayVenues = currentDay?.venues || [];
    return dayVenues
      .map((venue) => {
        const coordinates = venueAddressMap?.[venue.venue || venue.venueKey];
        const lat = toCoordinate(coordinates?.Latitude);
        const lng = toCoordinate(coordinates?.Longitude);
        if (lat === null || lng === null) {
          return null;
        }

        const nextBlock = venue.blocks[0] || null;

        return {
          venue: venue.venue,
          venueKey: venue.venueKey,
          venueName: venue.venueName,
          minDistance: venue.distance,
          totalBlocks: venue.blocks.length,
          totalCourts: venue.blocks.reduce(
            (total, block) => total + block.courtCount,
            0
          ),
          nextSlotStart: nextBlock ? nextBlock.startTime : null,
          nextSlotEnd: nextBlock ? nextBlock.endTime : null,
          lat,
          lng,
        };
      })
      .filter(Boolean);
  }, [currentDay, venueAddressMap]);

  const markersWithoutCoordinates = Math.max(
    (currentDay?.venues?.length || 0) - markerSummaries.length,
    0
  );

  const mapInfoVenueKey =
    hoveredVenueKey || selectedBlockDetails?.venueKey || focusedVenueKey || "";
  const mapInfoMarker =
    markerSummaries.find((marker) => marker.venueKey === mapInfoVenueKey) || null;
  const dayVenueMap = useMemo(() => {
    const map = new Map();
    (currentDay?.venues || []).forEach((venue) => {
      map.set(venue.venueKey, venue);
    });
    return map;
  }, [currentDay]);

  useEffect(() => {
    if (!mapInstance || !isMapLoaded || !window.google?.maps) {
      return;
    }

    const points = [
      ...markerSummaries.map((marker) => ({ lat: marker.lat, lng: marker.lng })),
    ];

    if (searchLocation) {
      points.push({
        lat: searchLocation.lat,
        lng: searchLocation.lng,
      });
    }

    if (points.length === 0) {
      mapInstance.setCenter(MAP_FALLBACK_CENTER);
      mapInstance.setZoom(10);
      return;
    }

    if (points.length === 1) {
      mapInstance.setCenter(points[0]);
      mapInstance.setZoom(12);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    mapInstance.fitBounds(bounds, 56);
  }, [isMapLoaded, mapInstance, markerSummaries, searchLocation]);

  return (
    <section className="availability-results-section mt-4">
      <div className="availability-results-header">
        <h2>Availability overview</h2>
        <div className="availability-results-meta">
          <Badge bg="secondary">
            {venueSummaries.length} venue{venueSummaries.length === 1 ? "" : "s"}
          </Badge>
          <Badge bg="secondary">
            {Array.isArray(slots) ? slots.length : 0} slot
            {Array.isArray(slots) && slots.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      {venueAddressWarning ? (
        <Alert variant="warning" className="mb-3">
          {venueAddressWarning}
        </Alert>
      ) : null}
      {searchLocationWarning ? (
        <Alert variant="warning" className="mb-3">
          {searchLocationWarning}
        </Alert>
      ) : null}

      <Card className="surface-card availability-map-card mb-3">
        <Card.Header className="availability-map-header">
          <strong>Venue map</strong>
          <div className="availability-map-controls">
            {focusedVenueKey ? (
              <Button
                type="button"
                size="sm"
                variant="outline-secondary"
                onClick={() => setFocusedVenueKey("")}
              >
                Clear focus
              </Button>
            ) : null}
          </div>
        </Card.Header>
        <Card.Body>
          {!apiKey ? (
            <Alert variant="warning" className="mb-0">
              Google Maps is not configured. Set{" "}
              <code>REACT_APP_GOOGLE_MAPS_API</code> and restart the frontend.
            </Alert>
          ) : mapLoadError ? (
            <Alert variant="danger" className="mb-0">
              Google Maps failed to load. Check your API key and allowed
              referrers/project settings.
            </Alert>
          ) : !isMapLoaded ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={searchLocation || MAP_FALLBACK_CENTER}
              zoom={11}
              onLoad={(map) => setMapInstance(map)}
              options={{
                fullscreenControl: false,
                mapTypeControl: false,
                streetViewControl: false,
              }}
            >
              {searchLocation ? (
                <MarkerF
                  position={{
                    lat: searchLocation.lat,
                    lng: searchLocation.lng,
                  }}
                  title={`Search location: ${searchLocation.label}`}
                />
              ) : null}

              {markerSummaries.map((marker) => {
                const isFocused = focusedVenueKey === marker.venueKey;
                const isHighlighted =
                  isFocused ||
                  hoveredVenueKey === marker.venueKey ||
                  selectedBlockDetails?.venueKey === marker.venueKey;

                return (
                  <MarkerF
                    key={marker.venueKey}
                    position={{
                      lat: marker.lat,
                      lng: marker.lng,
                    }}
                    icon={getVenueMarkerIcon(isHighlighted, isFocused)}
                    title={marker.venueName}
                    onMouseOver={() => setHoveredVenue(marker.venueKey)}
                    onMouseOut={clearHoveredVenue}
                    onClick={() => {
                      setFocusedVenueKey((currentValue) =>
                        currentValue === marker.venueKey ? "" : marker.venueKey
                      );
                    }}
                  />
                );
              })}

              {mapInfoMarker ? (
                <InfoWindowF
                  position={{
                    lat: mapInfoMarker.lat,
                    lng: mapInfoMarker.lng,
                  }}
                  onCloseClick={clearHoveredVenue}
                >
                  <div className="availability-map-tooltip">
                    <strong>{mapInfoMarker.venueName}</strong>
                    <div>{formatDistance(mapInfoMarker.minDistance)}</div>
                    {dayVenueMap.has(mapInfoMarker.venueKey) ? (
                      <div className="small text-muted">
                        {dayVenueMap.get(mapInfoMarker.venueKey).blocks.length} blocks
                        today
                      </div>
                    ) : null}
                    {mapInfoMarker.nextSlotStart !== null ? (
                      <div className="small text-muted">
                        Next: {minutesToTime(mapInfoMarker.nextSlotStart)} -{" "}
                        {minutesToTime(mapInfoMarker.nextSlotEnd)}
                      </div>
                    ) : null}
                  </div>
                </InfoWindowF>
              ) : null}
            </GoogleMap>
          )}
          {markersWithoutCoordinates > 0 ? (
            <div className="availability-map-footnote">
              {markersWithoutCoordinates} venue
              {markersWithoutCoordinates === 1 ? "" : "s"} missing coordinates.
            </div>
          ) : null}
        </Card.Body>
      </Card>

      {currentDay ? (
        <div className="availability-day-header">
          <div className="schedule-pagination mb-2">
            <Button
              variant="outline-secondary"
              onClick={() => setSelectedDayIndex((index) => index - 1)}
              disabled={!canGoPrevDay}
            >
              Previous day
            </Button>
            <strong>{formatDayHeading(currentDay.dateKey)}</strong>
            <Button
              variant="outline-secondary"
              onClick={() => setSelectedDayIndex((index) => index + 1)}
              disabled={!canGoNextDay}
            >
              Next day
            </Button>
          </div>
          {selectedBlockDetails ? (
            <div className="availability-day-actions">
              {selectedBlockDetails.bookingLink ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline-primary"
                  onClick={() => window.open(selectedBlockDetails.bookingLink, "_blank")}
                >
                  Open selected booking page
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleSendToTargetActions}
              >
                Send to target actions
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="availability-timeline-shell">
        <div className="availability-timeline-scroll">
          <div className="availability-timeline-header-row">
            <div className="availability-venue-header">Venue</div>
            <div
              className="availability-time-header-track"
              style={{ width: `${timelineWidth}px` }}
            >
              {timeMarks.map((minute) => (
                <span
                  key={minute}
                  className="availability-time-header-label"
                  style={{
                    left: `${(minute - dayBounds.windowStart) * PIXELS_PER_MINUTE}px`,
                  }}
                >
                  {minutesToTime(minute)}
                </span>
              ))}
            </div>
          </div>

          {visibleVenues.map((venue) => {
            const isFocused = focusedVenueKey === venue.venueKey;
            const isHighlighted =
              isFocused ||
              hoveredVenueKey === venue.venueKey ||
              selectedBlockDetails?.venueKey === venue.venueKey;

            return (
              <div
                key={venue.venueKey}
                className={`availability-timeline-row ${
                  isHighlighted ? "availability-timeline-row-highlighted" : ""
                }`}
                onMouseEnter={() => setHoveredVenue(venue.venueKey)}
                onMouseLeave={clearHoveredVenue}
              >
                <button
                  type="button"
                  className={`availability-venue-cell ${
                    isFocused ? "availability-venue-cell-focused" : ""
                  }`}
                  onClick={() =>
                    setFocusedVenueKey((currentValue) =>
                      currentValue === venue.venueKey ? "" : venue.venueKey
                    )
                  }
                >
                  <strong>{venue.venueName}</strong>
                  <span>{formatDistance(venue.distance)}</span>
                </button>

                <div
                  className="availability-timeline-track"
                  style={{
                    width: `${timelineWidth}px`,
                    backgroundSize: `${TIME_MARK_INTERVAL * PIXELS_PER_MINUTE}px 100%`,
                  }}
                >
                  {venue.blocks.map((block) => {
                    const left =
                      (block.startTime - dayBounds.windowStart) * PIXELS_PER_MINUTE;
                    const width = Math.max(
                      (block.endTime - block.startTime) * PIXELS_PER_MINUTE,
                      48
                    );
                    const isSelected =
                      selectedBlockDetails?.venueKey === venue.venueKey &&
                      selectedBlockDetails?.id === block.id;

                    const tooltip = [
                      venue.venueName,
                      `${formatDayHeading(currentDay?.dateKey)}`,
                      `${minutesToTime(block.startTime)} - ${minutesToTime(
                        block.endTime
                      )}`,
                      `${block.courtCount} court${block.courtCount === 1 ? "" : "s"}`,
                      formatCurrencyRange(block.minCost, block.maxCost),
                      formatDistance(block.distance ?? venue.distance),
                      block.courtNumbers.length > 0
                        ? `Courts: ${block.courtNumbers.join(", ")}`
                        : null,
                      block.names.length > 0 ? `Slots: ${block.names.join(" | ")}` : null,
                    ]
                      .filter(Boolean)
                      .join("\n");

                    return (
                      <article
                        key={block.id}
                        className={`availability-slot-block ${
                          isSelected ? "availability-slot-block-selected" : ""
                        }`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={tooltip}
                        onMouseEnter={() => setHoveredVenue(venue.venueKey)}
                        onMouseLeave={clearHoveredVenue}
                        onClick={() =>
                          setSelectedBlock({
                            venueKey: venue.venueKey,
                            blockId: block.id,
                          })
                        }
                      >
                        <div className="availability-slot-time">
                          {minutesToTime(block.startTime)} - {minutesToTime(block.endTime)}
                        </div>
                        <div className="availability-slot-meta">
                          {block.courtCount} court
                          {block.courtCount === 1 ? "" : "s"} ·{" "}
                          {formatCurrencyRange(block.minCost, block.maxCost)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AvailabilityResultsPanel;
