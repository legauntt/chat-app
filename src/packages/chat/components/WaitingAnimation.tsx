import React from 'react';
import styles from './WaitingAnimation.module.css';

const WaitingAnimation: React.FC = () => {
  return (
    <div className={styles.loader}>
      <div className={styles.bounce1} />
      <div className={styles.bounce2} />
      <div className={styles.bounce3} />
    </div>
  );
};

export default WaitingAnimation;
