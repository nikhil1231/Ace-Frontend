import React, { useEffect, useState } from "react";
import { Card, Container, ListGroup } from "react-bootstrap";

import { getBookings } from "../api";
import { fdate, fdatetime, minutesToTime } from "../util";

const BookingsPage = (props) => {
  const [bookings, setBookings] = useState({});
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);

  useEffect(() => {
    getBookings().then((data) => {
      setBookings(regroupBookings(data.bookings))
      setLastUpdatedTime(data.lastUpdated)
    });
  }, []);

  const regroupBookings = bookings => {
    bookings.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    const dateMapping = {}

    bookings.forEach(item => {
      if (!dateMapping[item.Date]) {
        dateMapping[item.Date] = [];
      }
      dateMapping[item.Date].push(item);
    });

    return dateMapping;
  }

  return (
    <Container className="mt-5">
      <h1>Bookings</h1>
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
                      Time: {minutesToTime(booking.StartTime)} - {minutesToTime(booking.EndTime)}
                    </ListGroup.Item>
                    <ListGroup.Item>Booking cost - £{booking.Cost.toFixed(2)}</ListGroup.Item>
                    <ListGroup.Item>
                      Cancel deadline
                      <br/>
                      {fdatetime(booking.CancelDeadline)}
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
