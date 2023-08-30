import React, { useEffect, useState } from "react";
import { Card, Container, ListGroup } from "react-bootstrap";

import { getBookingTargets } from "../api";
import { fdate, minutesToTime } from "../util";

const SchedulePage = (props) => {
  const [bookingTargets, setBookingTargets] = useState([]);

  useEffect(() => {
    getBookingTargets().then((bts) => setBookingTargets(bts));
  }, []);

  return (
    <Container className="mt-5">
      <h2>Scheduled</h2>
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
