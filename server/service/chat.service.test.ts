import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';
import ChatModel from '../schema/ChatModel';

const { mockCreate, MockAPIError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return { mockCreate: vi.fn(), MockAPIError };
});

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    static APIError = MockAPIError;
  }

  return { default: MockOpenAI };
});

describe('ChatService.enhance', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the model response text on success', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '  a helpful reply  ' } }],
    });

    const result = await ChatService.enhance('user-1', 'company-1', {
      prompt: 'Summarize this contract clause.',
      model: ChatModel.GptTurbo,
    });

    expect(result.text).toBe('a helpful reply');
    expect(result.created_by_id).toBe('user-1');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model: ChatModel.GptTurbo });
  });

  it('falls back to a friendly message when the OpenAI request fails', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(500, 'Internal server error'));

    const result = await ChatService.enhance('user-1', 'company-1', {
      prompt: 'Summarize this contract clause.',
      model: ChatModel.GptTurbo,
    });

    expect(result.text).toBe('Unable to generate AI assisted paragraph.');
  });

  it('rejects a prompt that exceeds the model token budget without calling OpenAI', async () => {
    const hugePrompt = 'word '.repeat(20000);

    const result = await ChatService.enhance('user-1', 'company-1', {
      prompt: hugePrompt,
      model: ChatModel.GptTurbo,
    });

    expect(result.text).toMatch(/too long/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
