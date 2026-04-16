import React from "react";
import { Badge, Col, Row } from "react-bootstrap";

import { ADMIN_ENDPOINTS, ADMIN_SECTIONS } from "../../admin/endpoints";
import EndpointCard from "../../components/admin/EndpointCard";

const AdminSectionPage = ({ sectionKey }) => {
  const section = ADMIN_SECTIONS.find(
    (currentSection) => currentSection.key === sectionKey
  );
  const endpoints = ADMIN_ENDPOINTS.filter(
    (endpoint) => endpoint.section === sectionKey
  );

  if (!section) {
    return null;
  }

  return (
    <div className="admin-section-page">
      <div className="page-heading admin-section-heading">
        <div>
          <h2>{section.label}</h2>
          <p className="page-subtitle">{section.description}</p>
        </div>
        <Badge bg="secondary">{endpoints.length} endpoints</Badge>
      </div>

      <Row className="g-4">
        {endpoints.map((endpoint) => (
          <Col xl={6} key={endpoint.id}>
            <EndpointCard endpoint={endpoint} />
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default AdminSectionPage;
