import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatStore from './ChatStore';
import RootStore from '../../app/store/RootStore';
import { fetchEventSource } from '@microsoft/fetch-event-source';

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn(),
}));

vi.mock('antd/lib/message', () => ({
  default: { error: vi.fn() },
}));

const openResponse = (contentType = 'text/event-stream', status = 200) => ({
  ok: status < 400,
  status,
  headers: { get: () => contentType },
});

describe('ChatStore', () => {
  let chatStore: ChatStore;

  beforeEach(() => {
    vi.mocked(fetchEventSource).mockReset();
    chatStore = new ChatStore(new RootStore());
  });

  it('resetChatPrompt seeds a single greeting message and clears state', () => {
    chatStore.resetChatPrompt();

    expect(chatStore.messages).toHaveLength(1);
    expect(chatStore.messages[0].role).toBe('assistant');
    expect(chatStore.submittingPrompt).toBe(false);
    expect(chatStore.imageUrls).toHaveLength(0);
  });

  it('addImageUrl / clearImageUrls track pasted images', () => {
    chatStore.addImageUrl({ id: '1', url: 'data:image/png;base64,abc' });
    expect(chatStore.imageUrls).toHaveLength(1);

    chatStore.clearImageUrls();
    expect(chatStore.imageUrls).toHaveLength(0);
  });

  it('clearStore stops submission and resets to the greeting message', () => {
    chatStore.messages.push({ role: 'user', content: 'hi' });
    chatStore.clearStore();

    expect(chatStore.submittingPrompt).toBe(false);
    expect(chatStore.messages).toHaveLength(1);
  });

  it('pushes a user message and a pending assistant message when a prompt is submitted', async () => {
    vi.mocked(fetchEventSource).mockImplementation(async (_url, opts: any) => {
      await opts.onopen(openResponse());
    });

    await chatStore.submitChatPrompt('hi there');

    expect(chatStore.messages).toHaveLength(2);
    expect(chatStore.messages[0]).toMatchObject({ role: 'user', content: 'hi there' });
    expect(chatStore.messages[1]).toMatchObject({ role: 'assistant', content: '' });
  });

  it('surfaces a FatalError from a non-retriable open response and stops submission', async () => {
    const antmessage = (await import('antd/lib/message')).default;

    vi.mocked(fetchEventSource).mockImplementation(async (_url, opts: any) => {
      await opts.onopen(openResponse('application/json', 400));
    });

    await chatStore.submitChatPrompt('hi there');

    expect(antmessage.error).toHaveBeenCalled();
    expect(chatStore.submittingPrompt).toBe(false);
  });

  it('gives up after MAX_ATTEMPTS retriable errors and stops submission', async () => {
    const antmessage = (await import('antd/lib/message')).default;

    vi.mocked(fetchEventSource).mockImplementation(async (_url, opts: any) => {
      for (let i = 0; i < 6; i++) {
        opts.onerror(new Error('network blip'));
      }
    });

    await chatStore.submitChatPrompt('hi there');

    expect(chatStore.retryAttempts).toBeGreaterThan(5);
    expect(antmessage.error).toHaveBeenCalled();
    expect(chatStore.submittingPrompt).toBe(false);
  });
});
