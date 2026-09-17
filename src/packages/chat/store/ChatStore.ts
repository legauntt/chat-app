import antmessage from 'antd/lib/message';
import dayjs from 'dayjs';
import FatalError from '../errors/FatalError';
import Message from '../schema/Message';
import OpenAiModel from '../schema/OpenAiModel';
import RetriableError from '../errors/RetriableError';
import RootStore from '../../app/store/RootStore';
import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source';

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

class ChatStore {
  submittingPrompt = false;
  retryAttempts = 0;
  model = OpenAiModel.GptTurbo;
  narrativeText = '';
  narrativeRetryAttempts = 0;
  generatingNarrative = false;

  messages = observable.array<Message>();
  imageUrls = observable.array<ImageUrl>();

  get isAwaitingChatResponse() {
    return this.submittingPrompt && !this.messages[this.messages.length - 1]?.content;
  }

  constructor(private rootStore: RootStore) {
    makeObservable(this, {
      submittingPrompt: observable,
      retryAttempts: observable,
      model: observable,
      narrativeText: observable,
      narrativeRetryAttempts: observable,
      generatingNarrative: observable,
      isAwaitingChatResponse: computed,
      submitChatPrompt: action,
      addImageUrl: action,
      clearImageUrls: action,
      resetChatPrompt: action,
      clearStore: action,
    });
  }

  async submitChatPrompt(prompt: string, imageUrls: ImageUrl[] = []) {
    this.submittingPrompt = true;

    try {
      const messagesInput: MessageInput[] = this.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      let content: any = prompt;
      if (imageUrls.length) {
        content = [
          {
            type: 'text',
            text: prompt,
          },
          ...imageUrls.map((imageUrl) => ({
            type: 'image_url',
            image_url: {
              url: imageUrl.url,
            },
          })),
        ];
      }

      messagesInput.push({
        role: 'user',
        content,
      });

      messagesInput.unshift({
        role: 'system',
        content:
          'I want you to act as an AI assistant for a general chatbot. Your role is to answer any questions I have.',
      });

      this.messages.push(
        {
          role: 'user',
          content,
          date: dayjs(),
        },
        {
          role: 'assistant',
          content: '',
        }
      );

      const controller = new AbortController();
      const signal = controller.signal;

      await fetchEventSource('http://localhost:8080/chat', {
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        openWhenHidden: true,
        body: JSON.stringify({ model: 'gpt-4-vision-preview', messages: messagesInput }),
        onopen: async (response) => {
          if (response.ok && response.headers.get('content-type') === EventStreamContentType) {
            runInAction(() => {
              this.messages[this.messages.length - 1].content = '';
            });
            return;
          }
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new FatalError();
          }

          throw new RetriableError();
        },
        onmessage: (msg) => {
          if (msg.event === 'FatalError') {
            throw new FatalError(msg.data);
          }

          if (msg.event === 'error') {
            const parsedError = JSON.parse(msg.data);
            if ([429, 500].includes(parsedError.statusCode)) {
              throw new RetriableError();
            } else {
              throw new FatalError(parsedError.error);
            }
          }

          if (msg.data) {
            const parsedData = JSON.parse(msg.data) as StreamData;
            runInAction(() => {
              if (parsedData.text) {
                this.messages[this.messages.length - 1].content += parsedData.text as string;
              }
            });

            if (parsedData.success) {
              runInAction(() => {
                this.submittingPrompt = false;
              });
              controller.abort();
            }
          }
        },
        onclose: () => {
          console.log('Connection closed by the server');
          throw new RetriableError();
        },
        onerror: (err) => {
          if (err instanceof FatalError) {
            console.log('There was an error from server', err);
            throw err; // rethrow to stop the operation
          }

          runInAction(() => {
            this.retryAttempts++;
          });
          if (this.retryAttempts > MAX_ATTEMPTS) {
            console.log('Max retry attempts reached', err);
            throw err;
          }

          console.log(`Retrying narrative call. Attempt ${this.retryAttempts}...`);
          const interval = Math.min(
            INITIAL_RETRY_INTERVAL * (BACKOFF_RATE ** this.retryAttempts - 1),
            MAX_RETRY_INTERVAL
          );
          return interval;
        },
      });
    } catch (err) {
      console.log('chat error', err);
      antmessage.error('Something went wrong with generating content!');
      runInAction(() => {
        this.submittingPrompt = false;
      });
    }

    return '';
  }

  addImageUrl(imageUrl: ImageUrl) {
    this.imageUrls.push(imageUrl);
  }

  clearImageUrls() {
    this.imageUrls.clear();
  }

  resetChatPrompt() {
    this.submittingPrompt = false;
    this.imageUrls.clear();
    this.messages.replace([
      {
        date: dayjs(),
        role: 'assistant',
        content: 'Hello! I can answer any questions you have. How can I help you?',
      },
    ]);
  }

  clearStore() {
    this.submittingPrompt = false;

    this.resetChatPrompt();
  }
}

export default ChatStore;
