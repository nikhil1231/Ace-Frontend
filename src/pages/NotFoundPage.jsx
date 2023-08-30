import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Button } from 'react-bootstrap';

const NotFoundPage = () => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <Container className="mt-5 text-center">
      <Row>
        <Col>
          <h1>404</h1>
          <h2>Page Not Found</h2>
          <p>The page you are looking for does not exist.</p>
          <Button variant="primary" onClick={handleGoBack}>
            Go Back
          </Button>
        </Col>
      </Row>
    </Container>
  );
};

export default NotFoundPage;