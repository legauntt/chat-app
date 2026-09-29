import { useEffect, useRef, useState } from 'react';
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source';
import { message as antmessage } from 'antd';
import dayjs from 'dayjs';
import FatalError from '../errors/FatalError';
import RetriableError from '../errors/RetriableError';
import Message from '../schema/Message';

const INITIAL_RETRY_INTERVAL = 4000;
const MAX_RETRY_INTERVAL = 16000;
const MAX_ATTEMPTS = 5;
const BACKOFF_RATE = 2;

interface ImageUrl {
  id: string;
  url: string;
}

interface StreamData {
  text: string;
  success?: boolean;
}

interface MessageInput {
  role: 'user' | 'assistant' | 'system';
  content: Message['content'];
}

const initialMessages = (): Message[] => [
  {
    date: dayjs(),
    role: 'assistant',
    content: 'Hello! I can answer any questions you have. How can I help you?',
  },
];

export default function useChat() {
  const [messages, setMessages] = useState(initialMessages);
  const [imageUrls, setImageUrls] = useState<ImageUrl[]>([]);
  const [submittingPrompt, setSubmittingPrompt] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    []
  );

  function reset() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setMessages(initialMessages());
    setImageUrls([]);
    setSubmittingPrompt(false);
  }

  async function submitChatPrompt(prompt: string, images: ImageUrl[] = []) {
    if (!prompt.length || activeRequest.current) {
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setSubmittingPrompt(true);

    const content: Message['content'] = images.length
      ? [
          { type: 'text', text: prompt },
          ...images.map(({ url }) => ({ type: 'image_url' as const, image_url: { url } })),
        ]
      : prompt;
    const messagesInput: MessageInput[] = [
      {
        role: 'system',
        content:
          'I want you to act as an AI assistant for a general chatbot. Your role is to answer any questions I have.',
      },
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content },
    ];
    const responseIndex = messages.length + 1;
    setMessages([
      ...messages,
      { role: 'user', content, date: dayjs() },
      { role: 'assistant', content: '' },
    ]);

    let retryAttempts = 0;
    const isActive = () => activeRequest.current === controller && !controller.signal.aborted;
    const updateResponse = (update: (text: string) => string) => {
      if (isActive()) {
        setMessages((current) =>
          current.map((message, index) =>
            index === responseIndex
              ? { ...message, content: update(message.content as string) }
              : message
          )
        );
      }
    };

    try {
      await fetchEventSource('http://localhost:8080/chat', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        openWhenHidden: true,
        body: JSON.stringify({ model: 'gpt-4-vision-preview', messages: messagesInput }),
        onopen: async (response) => {
          if (!isActive()) return;
          if (response.ok && response.headers.get('content-type') === EventStreamContentType) {
            updateResponse(() => '');
            return;
          }
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new FatalError();
          }
          throw new RetriableError();
        },
        onmessage: (msg) => {
          if (!isActive()) return;
          if (msg.event === 'FatalError') {
            throw new FatalError(msg.data);
          }
          if (msg.event === 'error') {
            const parsedError = JSON.parse(msg.data);
            if ([429, 500].includes(parsedError.statusCode)) {
              throw new RetriableError();
            }
            throw new FatalError(parsedError.error);
          }
          if (msg.data) {
            const parsedData = JSON.parse(msg.data) as StreamData;
            if (parsedData.text) {
              updateResponse((text) => text + parsedData.text);
            }
            if (parsedData.success) {
              setSubmittingPrompt(false);
              controller.abort();
            }
          }
        },
        onclose: () => {
          if (!isActive()) return;
          console.log('Connection closed by the server');
          throw new RetriableError();
        },
        onerror: (err) => {
          if (!isActive()) throw err;
          if (err instanceof FatalError) {
            console.log('There was an error from server', err);
            throw err;
          }
          retryAttempts++;
          if (retryAttempts > MAX_ATTEMPTS) {
            console.log('Max retry attempts reached', err);
            throw err;
          }
          console.log(`Retrying chat call. Attempt ${retryAttempts}...`);
          return Math.min(
            INITIAL_RETRY_INTERVAL * (BACKOFF_RATE ** retryAttempts - 1),
            MAX_RETRY_INTERVAL
          );
        },
      });
    } catch (err) {
      if (isActive()) {
        console.log('chat error', err);
        antmessage.error('Something went wrong with generating content!');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setSubmittingPrompt(false);
      }
    }
  }

  return {
    messages,
    imageUrls,
    submittingPrompt,
    isAwaitingChatResponse: submittingPrompt && !messages[messages.length - 1]?.content,
    submitChatPrompt,
    reset,
    addImageUrl: (image: ImageUrl) => setImageUrls((current) => [...current, image]),
    clearImageUrls: () => setImageUrls([]),
  };
}
