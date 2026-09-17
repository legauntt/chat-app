import ChatWriter from './ChatWriter';
import ContentPartImage from '../schema/ContentPartImage';
import ContentPartText from '../schema/ContentPartText';
import cx from 'classnames';
import gfm from 'remark-gfm';
import isContentPartImage from '../util/isContentPartImage';
import isHotkey from 'is-hotkey';
import Markdown from 'react-markdown';
import React, { useEffect, useRef, useState } from 'react';
import SendOutlined from '@ant-design/icons/SendOutlined';
import styles from './Chat.module.css';
import WaitingAnimation from './WaitingAnimation';
import { Button, Card, Input } from 'antd';
import { observer } from 'mobx-react';
import { useStores } from '../../../hooks/use-stores';
import { v4 as uuidv4 } from 'uuid';

const { TextArea } = Input;

const Chat: React.FC = () => {
  const { chatStore } = useStores();

  const [prompt, setPrompt] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatStore.resetChatPrompt();
  }, [chatStore]);

  useEffect(() => {
    const chatElement = ref.current as HTMLDivElement;

    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = chatElement;
      if (
        scrollTop + clientHeight === scrollHeight ||
        scrollTop + clientHeight + 1 >= scrollHeight
      ) {
        setAutoScroll(true);
      } else {
        setAutoScroll(false);
      }
    };

    chatElement.addEventListener('scroll', handleScroll);

    return () => chatElement.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (autoScroll && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [autoScroll, chatStore.submittingPrompt]);

  const cards = chatStore.messages.map((message, i) => {
    if (
      message.role === 'assistant' &&
      chatStore.submittingPrompt &&
      i === chatStore.messages.length - 1
    ) {
      if (!chatStore.isAwaitingChatResponse) {
        return (
          <Card className={cx(styles.card, styles.left)} key={i}>
            <ChatWriter text={message.content as string} />
          </Card>
        );
      }

      return null;
    }

    const textContent = Array.isArray(message.content)
      ? (message.content.find(({ type }) => type === 'text') as ContentPartText)?.text
      : message.content;

    let imageUrls: string[] = [];
    if (Array.isArray(message.content)) {
      const contentPartImages = message.content.filter((contentPart) =>
        isContentPartImage(contentPart)
      ) as ContentPartImage[];
      imageUrls = contentPartImages.map(({ image_url }) => image_url.url);
    }

    return (
      <Card
        className={cx(styles.card, message.role === 'user' ? styles.right : styles.left)}
        key={i}
      >
        <div className={styles.cardContent}>
          {!!imageUrls.length && (
            <div className={styles.chatImagePreviewContainer}>
              {imageUrls.map((url, idx) => (
                <img key={idx} src={url} alt="Thumbnail" />
              ))}
            </div>
          )}
          <Markdown remarkPlugins={[gfm]} children={textContent} />
        </div>
      </Card>
    );
  });

  const handlePaste = (e: any) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const index in items) {
      const item = items[index];
      if (item.kind === 'file') {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          chatStore.addImageUrl({
            id: uuidv4(),
            url: event.target?.result as string,
          });
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  const handleSubmitPrompt = () => {
    if (!prompt?.length || chatStore.submittingPrompt) {
      return;
    }
    chatStore.submitChatPrompt(prompt, chatStore.imageUrls);
    chatStore.clearImageUrls();
    setPrompt('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.chat} ref={ref}>
        {cards}
      </div>
      <div className={styles.bottomPane}>
        <div className={styles.promptContainer}>
          {chatStore.imageUrls.length > 0 && (
            <div className={styles.imagePreviewContainer}>
              {chatStore.imageUrls.map(({ id, url }, i) => (
                <div key={id} className={styles.imagePreview}>
                  <img src={url} alt="Uploaded File" />
                </div>
              ))}
            </div>
          )}
          <div className={styles.inputContainer}>
            <TextArea
              className={styles.input}
              placeholder="Send a message"
              autoSize={{ minRows: 1, maxRows: 8 }}
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                e.stopPropagation();

                if (isHotkey('enter', e)) {
                  e.preventDefault();

                  handleSubmitPrompt();
                  return false;
                }

                return true;
              }}
            />
            <div className={styles.sendBtn}>
              {chatStore.submittingPrompt ? (
                <WaitingAnimation />
              ) : (
                <Button
                  disabled={!prompt?.length}
                  icon={<SendOutlined />}
                  onClick={() => handleSubmitPrompt()}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default observer(Chat);
