import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import Chat from './Chat';

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn(
    (_url, options) =>
      new Promise<void>((resolve) => {
        options.signal.addEventListener('abort', () => resolve(), { once: true });
      })
  ),
}));

describe('Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!('ResizeObserver' in globalThis)) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('renders the greeting message and a disabled send button until there is input', () => {
    render(<Chat />);

    expect(screen.getByText(/how can i help you/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('sends the prompt, clears the composer, and renders the completed reply', async () => {
    render(<Chat />);

    const textbox = screen.getByPlaceholderText('Send a message');
    fireEvent.change(textbox, { target: { value: 'Hello, testing the upgrade' } });

    const sendButton = screen.getByRole('button');
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    expect(fetchEventSource).toHaveBeenCalledTimes(1);
    const options = vi.mocked(fetchEventSource).mock.calls[0][1];
    expect(JSON.parse(options.body as string).messages.at(-1)).toEqual({
      role: 'user',
      content: 'Hello, testing the upgrade',
    });
    expect(textbox).toHaveValue('');
    expect(screen.getByText('Hello, testing the upgrade')).toBeInTheDocument();
    await act(async () => {
      options.onmessage!({
        id: '',
        event: 'message',
        data: JSON.stringify({ text: 'A streamed reply', success: true }),
      });
    });
    expect(screen.getByText('A streamed reply')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
