import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
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

beforeEach(() => {
  mockCreate.mockReset();
});

describe('ChatService.enhance', () => {
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
    expect(mockCreate.mock.calls[0][0]).toEqual({
      model: ChatModel.GptTurbo,
      messages: [{ role: 'user', content: expect.stringContaining('Summarize this contract clause.') }],
    });
  });

  it('falls back to a friendly message when the OpenAI request fails', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(500, 'Internal server error'));

    const result = await ChatService.enhance('user-1', 'company-1', {
      prompt: 'Summarize this contract clause.',
      model: ChatModel.GptTurbo,
    });

    expect(result.text).toBe('Unable to generate AI assisted paragraph.');
  });

  it('lets the API validate context length for the requested model', async () => {
    const hugePrompt = 'word '.repeat(20000);
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'A summary' } }] });

    const result = await ChatService.enhance('user-1', 'company-1', {
      prompt: hugePrompt,
      model: ChatModel.Gpt4Vision,
    });

    expect(result.text).toBe('A summary');
    expect(mockCreate).toHaveBeenCalledWith({
      model: ChatModel.Gpt4Vision,
      messages: [{ role: 'user', content: expect.stringContaining(hugePrompt) }],
    });
  });
});

describe('ChatService.invokeCompletionRequest', () => {
  const response = () => ({
    sse: { push: vi.fn() },
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
  });

  it('preserves the client model and emits the text events consumed by the chat client', async () => {
    const res = response();
    const messages = [{ role: 'user', content: [
      { type: 'text', text: 'Describe this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ] }];
    mockCreate.mockResolvedValue((async function* () {
      yield { choices: [{ delta: { role: 'assistant', content: '' }, finish_reason: null }] };
      yield { choices: [{ delta: { content: 'A ' }, finish_reason: null }] };
      yield { choices: [{ delta: { content: 'picture' }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    })());

    await ChatService.invokeCompletionRequest(res as unknown as Response, {
      prompt: '', messages, model: ChatModel.Gpt4Vision,
    });

    expect(mockCreate).toHaveBeenCalledWith({ model: ChatModel.Gpt4Vision, messages, stream: true });
    expect(res.sse.push.mock.calls).toEqual([
      [{ text: 'A ' }], [{ text: 'picture' }], [{ success: true }],
    ]);
  });

  it.each([undefined, 'gpt-4'])('preserves explicit models and function parameters (%s)', async (model) => {
    const res = response();
    const functions = [{ name: 'answer', parameters: { type: 'object', properties: {} } }];
    mockCreate.mockResolvedValue((async function* () {
      yield { choices: [{ delta: { function_call: { arguments: '{}' } } }] };
    })());

    await ChatService.invokeCompletionRequest(res as unknown as Response, {
      prompt: 'Answer', model, functions, function_call: 'auto',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: model || ChatModel.GptTurbo,
      messages: [{ role: 'user', content: expect.stringContaining('Answer') }],
      functions, function_call: 'auto', stream: true,
    });
    expect(res.sse.push.mock.calls).toEqual([[{ text: '{}' }], [{ success: true }]]);
  });

  it.each([400, 401, 429, 500])('forwards API error %i without reporting success', async (status) => {
    const res = response();
    mockCreate.mockRejectedValue(new MockAPIError(status, 'OpenAI rejected the request'));

    await ChatService.invokeCompletionRequest(res as unknown as Response, { prompt: 'Hello' });

    expect(res.sse.push).toHaveBeenCalledExactlyOnceWith({
      error: 'Error: OpenAI rejected the request', statusCode: status,
    }, 'error');
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
