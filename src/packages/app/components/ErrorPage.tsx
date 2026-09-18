import React from 'react';
import { Typography } from 'antd';

const { Paragraph, Title } = Typography;

const ErrorPage: React.FC = () => {
  return (
    <>
      <Title>Oops!</Title>
      <Paragraph>Sorry, an unexpected error has occurred.</Paragraph>
    </>
  );
};

export default ErrorPage;
