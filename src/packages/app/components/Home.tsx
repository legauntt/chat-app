import { Button } from 'antd';
import React from 'react';
import styles from './Home.module.css';
import { createStoreContext } from '../../../contexts/StoreContext';

const Home: React.FC = () => {
  createStoreContext();

  return (
    <header className={styles.header}>
      <Button type="primary" href="/chat" size="large">
        Start Chat
      </Button>
    </header>
  );
};

export default Home;
