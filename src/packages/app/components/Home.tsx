import { Button } from 'antd';
import React from 'react';
import styles from './Home.module.css';

const Home: React.FC = () => {
  return (
    <header className={styles.header}>
      <Button type="primary" href="/chat" size="large">
        Start Chat
      </Button>
    </header>
  );
};

export default Home;
