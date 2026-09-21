import Chat from './Chat';
import React from 'react';
import styles from './ChatContainer.module.css';
import { Layout } from 'antd';

const ChatContainer: React.FC = () => {
  return (
    <Layout className={styles.container}>
      <Layout.Content>
        <div className={styles.chatContainer}>
          <Chat />
        </div>
      </Layout.Content>
    </Layout>
  );
};

export default ChatContainer;
