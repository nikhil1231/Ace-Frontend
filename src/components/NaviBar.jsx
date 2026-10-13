import "./NaviBar.css";

import React from "react";
import { Badge, Container, Nav, Navbar } from "react-bootstrap";
import { NavLink } from "react-router-dom";

import { useSession } from "../context/SessionContext";

const Navibar = () => {
  const { email, isAdmin } = useSession();
  const brandIcon = `${process.env.PUBLIC_URL}/ace-icon.png`;

  return (
    <Navbar bg="light" expand="lg" className="app-navbar shadow-sm">
      <Container fluid="lg">
        <Navbar.Brand as={NavLink} to="/" end>
          <img className="navbar-brand-icon" src={brandIcon} alt="" />
          Ace
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="navbar-nav" />
        <Navbar.Collapse id="navbar-nav">
          <Nav className="me-auto">
            <Nav.Link as={NavLink} to="/" end>
              Bookings
            </Nav.Link>
            <Nav.Link as={NavLink} to="/schedule">
              Schedule
            </Nav.Link>
            <Nav.Link as={NavLink} to="/venue">
              Venue
            </Nav.Link>
            <Nav.Link as={NavLink} to="/map">
              Map
            </Nav.Link>
            <Nav.Link as={NavLink} to="/monitor">
              Monitor
            </Nav.Link>
            {isAdmin ? (
              <Nav.Link as={NavLink} to="/admin" end>
                Admin
              </Nav.Link>
            ) : null}
          </Nav>
          <div className="navbar-status">
            {email ? <span className="navbar-email">{email}</span> : null}
            {isAdmin ? <Badge bg="dark">Admin</Badge> : null}
            {/* Cloudflare Access serves this path and ends the Access session. */}
            <Nav.Link href="/cdn-cgi/access/logout">Sign out</Nav.Link>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navibar;
