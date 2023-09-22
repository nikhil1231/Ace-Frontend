import "./NaviBar.css";

import React, { useEffect, useState } from "react";
import { Nav, Navbar } from "react-bootstrap";
import { Link, Route, Routes } from "react-router-dom";

import MapPage from "../pages/MapPage";
import NotFoundPage from "../pages/NotFoundPage";
import BookingsPage from "../pages/BookingsPage";
import SchedulePage from "../pages/SchedulePage";

const Navibar = () => {
  return (
    <>
      <Navbar bg="light" expand="lg">
        <Navbar.Brand as={Link} to="/">
          Ace
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="navbar-nav" />
        <Navbar.Collapse id="navbar-nav">
          <Nav className="mr-auto">
            <Nav.Link as={Link} to="/">
              Bookings
            </Nav.Link>
            <Nav.Link as={Link} to="/schedule">
              Schedule
            </Nav.Link>
            <Nav.Link as={Link} to="/map">
              Map
            </Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Navbar>

      <Routes>
        <Route path="/" element={<BookingsPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
};

export default Navibar;
