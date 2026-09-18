import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Chat from './Chat';
import RootStore from '../../app/store/RootStore';
import { createStoreContext, getStoreContext } from '../../../contexts/StoreContext';

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn(() => new Promise(() => {})),
}));

const renderChat = () => {
  createStoreContext();
  const StoreContext = getStoreContext();
  const rootStore = new RootStore();

  render(
    <StoreContext.Provider value={rootStore}>
      <Chat />
    </StoreContext.Provider>
  );

  return rootStore;
};

describe('Chat', () => {
  beforeEach(() => {
    if (!('ResizeObserver' in globalThis)) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('renders the greeting message and a disabled send button until there is input', () => {
    renderChat();

    expect(screen.getByText(/how can i help you/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('enables send once text is entered and submits it through the chat store', () => {
    const rootStore = renderChat();
    const submitSpy = vi.spyOn(rootStore.chatStore, 'submitChatPrompt');

    const textbox = screen.getByPlaceholderText('Send a message');
    fireEvent.change(textbox, { target: { value: 'Hello, testing the upgrade' } });

    const sendButton = screen.getByRole('button');
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy.mock.calls[0][0]).toBe('Hello, testing the upgrade');
    expect(submitSpy.mock.calls[0][1]).toHaveLength(0);
    expect(textbox).toHaveValue('');
  });
});
