import React, { useEffect, useState } from "react";
import { Alert, Card, Container, ListGroup, Spinner } from "react-bootstrap";

import { getBookingTargets } from "../api";
import { fdate, minutesToTime } from "../util";

const SchedulePage = (props) => {
  const [bookingTargets, setBookingTargets] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getBookingTargets()
      .then((bts) => {
        setBookingTargets(bts);
        setError("");
      })
      .catch((requestError) =>
        setError(requestError.message || "Failed to load booking targets.")
      )
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Schedule</h1>
          <p className="page-subtitle">
            Inspect the booking targets currently saved on the backend.
          </p>
        </div>
      </div>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {isLoading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : null}
      {!isLoading && bookingTargets.length === 0 ? (
        <Alert variant="secondary">No booking targets are scheduled yet.</Alert>
      ) : null}
      {bookingTargets.map((bt, i) => (
        <Card key={i} style={{ marginBottom: "15px" }}>
          <Card.Body>
            <Card.Title>
              {bt.Venue} ({bt.NumCourts} Courts)
            </Card.Title>
            <ListGroup>
              <ListGroup.Item>{fdate(bt.Date)}</ListGroup.Item>
              <ListGroup.Item>
                {minutesToTime(bt.StartTime)} - {minutesToTime(bt.EndTime)}
              </ListGroup.Item>
            </ListGroup>
          </Card.Body>
        </Card>
      ))}
    </Container>
  );
};

export default SchedulePage;
