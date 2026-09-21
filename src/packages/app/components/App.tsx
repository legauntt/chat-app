import React from 'react';
import styles from './App.module.css';
import { Outlet } from 'react-router-dom';

const App: React.FC = () => {
  return (
    <div className={styles.app}>
      <Outlet />
    </div>
  );
};

export default App;
