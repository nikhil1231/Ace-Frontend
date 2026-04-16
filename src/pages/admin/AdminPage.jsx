import React from "react";
import { Badge, Container, Nav } from "react-bootstrap";
import { NavLink, Outlet } from "react-router-dom";

import { useAppSettings } from "../../context/AppSettingsContext";

const AdminPage = () => {
  const { selectedEnvironment } = useAppSettings();

  return (
    <Container className="page-container">
      <div className="page-heading">
        <div>
          <h1>Admin</h1>
          <p className="page-subtitle">
            Test the ACE backend through the same frontend app, with one place
            for diagnostics, endpoints, presets, and recent request history.
          </p>
        </div>
        <Badge bg={selectedEnvironment === "local" ? "success" : "primary"}>
          {selectedEnvironment === "local" ? "Local" : "Hosted"}
        </Badge>
      </div>

      <Nav variant="tabs" className="admin-tabs">
        <Nav.Item>
          <Nav.Link as={NavLink} to="/admin" end>
            Overview
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link as={NavLink} to="/admin/schedule">
            Schedule
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link as={NavLink} to="/admin/venues">
            Venues
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link as={NavLink} to="/admin/bookings">
            Bookings
          </Nav.Link>
        </Nav.Item>
      </Nav>

      <div className="admin-content">
        <Outlet />
      </div>
    </Container>
  );
};

export default AdminPage;
