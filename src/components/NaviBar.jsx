import "./NaviBar.css";

import React from "react";
import { Badge, Container, Nav, Navbar } from "react-bootstrap";
import { NavLink } from "react-router-dom";

import { useAppSettings } from "../context/AppSettingsContext";

const Navibar = () => {
  const { hasAdminAccess, selectedEnvironment } = useAppSettings();

  const environmentLabel =
    selectedEnvironment === "local" ? "Local backend" : "Hosted backend";

  return (
    <Navbar bg="light" expand="lg" className="app-navbar shadow-sm">
      <Container fluid="lg">
        <Navbar.Brand as={NavLink} to="/" end>
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
            <Nav.Link as={NavLink} to="/map">
              Map
            </Nav.Link>
            {hasAdminAccess ? (
              <Nav.Link as={NavLink} to="/admin" end>
                Admin
              </Nav.Link>
            ) : (
              <Nav.Link as="span" className="disabled admin-disabled-link">
                Admin
              </Nav.Link>
            )}
            <Nav.Link as={NavLink} to="/settings">
              Settings
            </Nav.Link>
          </Nav>
          <div className="navbar-status">
            <Badge bg={selectedEnvironment === "local" ? "success" : "primary"}>
              {environmentLabel}
            </Badge>
            <Badge bg={hasAdminAccess ? "dark" : "secondary"}>
              {hasAdminAccess ? "Admin unlocked" : "Admin locked"}
            </Badge>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navibar;
