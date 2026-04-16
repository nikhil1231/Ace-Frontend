import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Container,
  ListGroup,
  Spinner,
} from "react-bootstrap";

import { getBookings, cancelBooking, refreshBookings } from "../api";
import { fdate, fdatetime, minutesToTime } from "../util";

const regroupBookings = (bookings) => {
  bookings.sort((a, b) => new Date(a.Date) - new Date(b.Date));

  const dateMapping = {};

  bookings.forEach((item) => {
    if (!dateMapping[item.Date]) {
      dateMapping[item.Date] = [];
    }
    dateMapping[item.Date].push(item);
  });

  return dateMapping;
};

const BookingsPage = (props) => {
  const [bookings, setBookings] = useState({});
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBookings = async () => {
    try {
      setError("");
      const data = await getBookings();
      setBookings(regroupBookings(data.bookings));
      setLastUpdatedTime(data.lastUpdated);
    } catch (requestError) {
      setError(requestError.message || "Failed to load bookings.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadInitialBookings = async () => {
      try {
        setError("");
        const data = await getBookings();

        if (isCancelled) {
          return;
        }

        setBookings(regroupBookings(data.bookings));
        setLastUpdatedTime(data.lastUpdated);
      } catch (requestError) {
        if (!isCancelled) {
          setError(requestError.message || "Failed to load bookings.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    loadInitialBookings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setError("");
      await refreshBookings();
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      await loadBookings();
    } catch (requestError) {
      setError(requestError.message || "Failed to refresh bookings.");
      setIsRefreshing(false);
    }
  };

  const handleCancel = async (booking) => {
    try {
      setError("");
      await cancelBooking(booking.Venue, booking.SessionID, booking.Username);
      await loadBookings();
    } catch (requestError) {
      setError(requestError.message || "Failed to cancel booking.");
    }
  };

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Bookings</h1>
          <p className="page-subtitle">
            Review the current bookings cache and trigger a refresh from the
            Clubspark accounts already configured on the backend.
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      {lastUpdatedTime ? (
        <p className="page-subtitle compact-subtitle">
          Last updated {fdatetime(lastUpdatedTime)}
        </p>
      ) : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {isLoading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : null}
      {!isLoading && Object.keys(bookings).length === 0 ? (
        <Alert variant="secondary">No cached bookings are available yet.</Alert>
      ) : null}
      {Object.entries(bookings).map(([date, dateBookings]) => (
        <div key={date}>
          <h4>{fdate(date)}</h4>
          {dateBookings.map((booking, i) => (
            <Card style={{ marginBottom: "15px" }} key={i}>
              <Card.Body>
                <Card.Title>
                  {booking.Venue} - Court {booking.CourtNumber}
                </Card.Title>
                <ListGroup>
                  <ListGroup.Item>
                    Time: {minutesToTime(booking.StartTime)} -{" "}
                    {minutesToTime(booking.EndTime)}
                  </ListGroup.Item>
                  <ListGroup.Item>
                    Booking cost - £{booking.Cost.toFixed(2)}
                  </ListGroup.Item>
                  <ListGroup.Item>
                    Cancel deadline
                    <br />
                    {fdatetime(booking.CancelDeadline)}
                    <Button
                      style={{ float: "right" }}
                      variant="danger"
                      onClick={() => handleCancel(booking)}
                    >
                      Cancel
                    </Button>
                  </ListGroup.Item>
                </ListGroup>
              </Card.Body>
            </Card>
          ))}
        </div>
      ))}
    </Container>
  );
};

export default BookingsPage;
