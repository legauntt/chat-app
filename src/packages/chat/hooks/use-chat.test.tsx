import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEventSource, FetchEventSourceInit } from '@microsoft/fetch-event-source';
import { message as antmessage } from 'antd';
import React from 'react';
import FatalError from '../errors/FatalError';
import RetriableError from '../errors/RetriableError';
import useChat from './use-chat';

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn(),
}));

vi.mock('antd', () => ({ message: { error: vi.fn() } }));

const response = (status = 200, contentType = 'text/event-stream') =>
  new Response(null, { status, headers: { 'content-type': contentType } });
const streamMessage = (data: object, event = 'message') => ({
  id: '',
  event,
  data: JSON.stringify(data),
});
const latestRequest = () => vi.mocked(fetchEventSource).mock.calls.at(-1)![1];

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchEventSource).mockImplementation(
      (_url, options) =>
        new Promise<void>((resolve) => {
          options.signal?.addEventListener('abort', () => resolve(), { once: true });
        })
    );
  });

  it('starts with one greeting and tracks pasted images with React state', () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ role: 'assistant' });
    expect(result.current.submittingPrompt).toBe(false);
    act(() => {
      result.current.addImageUrl({ id: '1', url: 'data:image/png;base64,abc' });
      result.current.addImageUrl({ id: '2', url: 'data:image/png;base64,def' });
    });
    expect(result.current.imageUrls).toHaveLength(2);
    act(() => result.current.clearImageUrls());
    expect(result.current.imageUrls).toEqual([]);
  });

  it('ignores empty prompts and overlapping submissions', () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      void result.current.submitChatPrompt('');
      void result.current.submitChatPrompt('first');
      void result.current.submitChatPrompt('second');
    });
    expect(fetchEventSource).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[1].content).toBe('first');
  });

  it('resets a completed conversation and draft images to a fresh greeting', async () => {
    const { result } = renderHook(() => useChat());
    const greeting = result.current.messages[0];
    act(() => {
      void result.current.submitChatPrompt('old conversation');
    });
    await act(async () => {
      latestRequest().onmessage!(streamMessage({ text: 'old reply', success: true }));
    });
    act(() => result.current.addImageUrl({ id: '1', url: 'data:image/png;base64,abc' }));
    act(() => result.current.reset());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: greeting.role,
      content: greeting.content,
    });
    expect(result.current.messages[0]).not.toBe(greeting);
    expect(result.current.imageUrls).toEqual([]);
    expect(result.current.submittingPrompt).toBe(false);
    expect(result.current.isAwaitingChatResponse).toBe(false);

    act(() => result.current.reset());
    expect(result.current.messages).toHaveLength(1);
    act(() => { void result.current.submitChatPrompt('fresh conversation'); });
    expect(JSON.parse(latestRequest().body as string).messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: greeting.role, content: greeting.content },
      { role: 'user', content: 'fresh conversation' },
    ]);
  });

  it.each(['resolve', 'reject'])('ignores old stream events and late %s after reset', async (outcome) => {
    let finishRequest!: () => void;
    vi.mocked(fetchEventSource).mockImplementationOnce(
      () => new Promise<void>((resolve, reject) => {
        finishRequest = () => outcome === 'resolve' ? resolve() : reject(new Error('late failure'));
      })
    );
    const { result } = renderHook(() => useChat());
    act(() => { void result.current.submitChatPrompt('old request'); });
    const oldOptions = latestRequest();
    act(() => oldOptions.onmessage!(streamMessage({ text: 'partial reply' })));
    act(() => result.current.reset());
    expect(oldOptions.signal!.aborted).toBe(true);
    expect(result.current.submittingPrompt).toBe(false);
    act(() => { void result.current.submitChatPrompt('new request'); });
    const newOptions = latestRequest();

    await act(async () => {
      await oldOptions.onopen!(response());
      oldOptions.onmessage!(streamMessage({ text: 'stale reply', success: true }));
      oldOptions.onmessage!(streamMessage({ statusCode: 400, error: 'late error' }, 'error'));
      oldOptions.onclose!();
      expect(() => oldOptions.onerror!(new Error('late retry'))).toThrow('late retry');
      finishRequest();
    });
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[1].content).toBe('new request');
    expect(result.current.messages[2].content).toBe('');
    expect(result.current.submittingPrompt).toBe(true);
    expect(newOptions.signal!.aborted).toBe(false);
    expect(antmessage.error).not.toHaveBeenCalled();
    await act(async () => {
      newOptions.onmessage!(streamMessage({ text: 'fresh reply', success: true }));
    });
    expect(result.current.messages[2].content).toBe('fresh reply');
    expect(result.current.submittingPrompt).toBe(false);
  });

  it('preserves the multimodal request when draft images are cleared after sending', () => {
    const { result } = renderHook(() => useChat());
    const image = { id: '1', url: 'data:image/png;base64,abc' };
    act(() => result.current.addImageUrl(image));
    act(() => {
      void result.current.submitChatPrompt('Describe this', result.current.imageUrls);
      result.current.clearImageUrls();
    });
    expect(fetchEventSource).toHaveBeenCalledWith(
      'http://localhost:8080/chat',
      expect.objectContaining({
        method: 'POST',
        openWhenHidden: true,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      })
    );
    const body = JSON.parse(latestRequest().body as string);
    expect(body.model).toBe('gpt-4-vision-preview');
    expect(body.messages).toEqual([
      {
        role: 'system',
        content:
          'I want you to act as an AI assistant for a general chatbot. Your role is to answer any questions I have.',
      },
      { role: 'assistant', content: result.current.messages[0].content },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          { type: 'image_url', image_url: { url: image.url } },
        ],
      },
    ]);
    expect(result.current.imageUrls).toEqual([]);
    expect(result.current.messages[1].content).toEqual(body.messages[2].content);
  });

  it('renders streamed chunks, finishes on success, and includes the reply in the next request', async () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      void result.current.submitChatPrompt('hello');
    });
    const options = latestRequest();
    expect(result.current.isAwaitingChatResponse).toBe(true);
    await act(async () => {
      await options.onopen!(response());
    });
    act(() => {
      options.onmessage!(streamMessage({ text: 'Hello' }));
      options.onmessage!(streamMessage({ text: ' there' }));
    });
    expect(result.current.messages[2].content).toBe('Hello there');
    expect(result.current.isAwaitingChatResponse).toBe(false);
    await act(async () => {
      options.onmessage!(streamMessage({ success: true }));
    });
    expect(options.signal!.aborted).toBe(true);
    expect(result.current.submittingPrompt).toBe(false);
    act(() => {
      void result.current.submitChatPrompt('next');
    });
    expect(JSON.parse(latestRequest().body as string).messages.slice(-3)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hello there' },
      { role: 'user', content: 'next' },
    ]);
  });

  it.each([400, 401, 403])('reports HTTP %i once and allows another submission', async (status) => {
    vi.mocked(fetchEventSource).mockImplementationOnce(async (_url, options) => {
      await options.onopen!(response(status, 'application/json'));
    });
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.submitChatPrompt('hello');
    });
    expect(antmessage.error).toHaveBeenCalledTimes(1);
    expect(result.current.submittingPrompt).toBe(false);
    act(() => {
      void result.current.submitChatPrompt('try again');
    });
    expect(fetchEventSource).toHaveBeenCalledTimes(2);
    expect(result.current.submittingPrompt).toBe(true);
  });

  it.each([429, 500])(
    'retries HTTP %i and replaces partial text when the stream reopens',
    async (status) => {
      const { result } = renderHook(() => useChat());
      act(() => {
        void result.current.submitChatPrompt('hello');
      });
      const options = latestRequest();
      await expect(options.onopen!(response(status))).rejects.toBeInstanceOf(RetriableError);
      act(() => {
        options.onmessage!(streamMessage({ text: 'partial' }));
      });
      await act(async () => {
        await options.onopen!(response());
      });
      act(() => {
        options.onmessage!(streamMessage({ text: 'replacement' }));
      });
      expect(result.current.messages[2].content).toBe('replacement');
    }
  );

  it('preserves fatal and retriable SSE errors and unexpected-close behavior', () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      void result.current.submitChatPrompt('hello');
    });
    const options = latestRequest();
    expect(() => options.onmessage!(streamMessage({ statusCode: 429 }, 'error'))).toThrow(
      RetriableError
    );
    expect(() => options.onmessage!(streamMessage({ statusCode: 500 }, 'error'))).toThrow(
      RetriableError
    );
    expect(() =>
      options.onmessage!(streamMessage({ statusCode: 400, error: 'bad input' }, 'error'))
    ).toThrow(FatalError);
    expect(() => options.onmessage!({ id: '', event: 'FatalError', data: 'invalid key' })).toThrow(
      FatalError
    );
    expect(() => options.onerror!(new FatalError())).toThrow(FatalError);
    expect(() => options.onclose!()).toThrow(RetriableError);
  });

  it('caps retries at five and gives the next prompt its own retry budget', async () => {
    const intervals: unknown[] = [];
    vi.mocked(fetchEventSource).mockImplementationOnce(async (_url, options) => {
      for (let i = 0; i < 6; i++) {
        intervals.push(options.onerror!(new Error('network blip')));
      }
    });
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.submitChatPrompt('hello');
    });
    expect(intervals).toEqual([4000, 12000, 16000, 16000, 16000]);
    expect(antmessage.error).toHaveBeenCalledTimes(1);
    expect(result.current.submittingPrompt).toBe(false);
    act(() => {
      void result.current.submitChatPrompt('try again');
    });
    expect(latestRequest().onerror!(new Error('network blip'))).toBe(4000);
  });

  it('aborts on unmount and ignores late events without affecting a new screen', async () => {
    let rejectRequest!: (error: Error) => void;
    vi.mocked(fetchEventSource).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    const first = renderHook(() => useChat());
    act(() => {
      void first.result.current.submitChatPrompt('old request');
    });
    const oldOptions: FetchEventSourceInit = latestRequest();
    first.unmount();
    expect(oldOptions.signal!.aborted).toBe(true);
    const second = renderHook(() => useChat(), { wrapper: React.StrictMode });
    act(() => {
      void second.result.current.submitChatPrompt('new request');
    });
    await act(async () => {
      oldOptions.onmessage!(streamMessage({ text: 'stale text', success: true }));
      rejectRequest(new Error('late failure'));
    });
    expect(second.result.current.messages).toHaveLength(3);
    expect(second.result.current.messages[1].content).toBe('new request');
    expect(second.result.current.messages[2].content).toBe('');
    expect(second.result.current.submittingPrompt).toBe(true);
    expect(antmessage.error).not.toHaveBeenCalled();
  });
});
