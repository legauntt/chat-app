import ChatModel from '../schema/ChatModel';
import OpenAI from 'openai';
import PromptInput from '../schema/PromptInput';
import { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat';
import { Completion, CompletionCreateParamsStreaming } from 'openai/resources';
import { Response } from 'express';
import { Stream } from 'openai/streaming';

const openai = new OpenAI({
  apiKey: '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',
});

function generatePrompt(prompt: string, context?: string, topic?: string) {
  const promptTopic = topic ? `The topic of the following response is "${topic}". ` : '';
  return `
    ${prompt}

    ${context || ''} ${promptTopic}
  `;
}

export class ChatService {
  public static async enhance(userId: string, companyId: string, input: PromptInput) {
    try {
      const prompt = generatePrompt(input.prompt, input.prompt_context, input.topic);
      const openaiModelInput = { model: input.model || ChatModel.GptTurbo };

      let response: string;
      const chatCompletion = await openai.chat.completions.create({
        ...openaiModelInput,
        messages: [{ role: 'user', content: prompt }],
      });
      response = chatCompletion.choices[0].message?.content || '';

      return {
        text: response?.trim() || '',
        created_by_id: userId,
        created_at: new Date(),
      };
    } catch (error) {
      const err = error as any;

      let text = 'Unable to generate AI assisted paragraph.';
      if (err.response) {
        console.log(
          `Openai error: ${err.response.status}, ${JSON.stringify(err.response.data, null, 2)}`
        );
        if (err.response.data?.error?.message?.includes('reduce your prompt')) {
          text =
            'Prompt and response are too long. Please shorten the prompt or try a different model.';
        }
      } else {
        console.log(`Error with OpenAI API request: ${err.message}`);
      }

      return {
        text,
        created_by_id: userId,
        created_at: new Date(),
      };
    }
  }

  public static async invokeCompletionRequest(res: Response & { sse?: any }, input: PromptInput) {
    if (!input.messages && !input.prompt && !input.prompt_context) {
      throw new Error('Prompt or context is required.');
    }

    const model = input.model || ChatModel.GptTurbo;

    try {
      let messages = input.messages;
      if (!messages) {
        const prompt = generatePrompt(input.prompt, input.prompt_context, input.topic);
        messages = [{ role: 'user', content: prompt }];
      }

      const chatCompletionRequest = { model, messages } as any;
      if (input.functions) {
        chatCompletionRequest.functions = input.functions;
      }
      if (input.function_call) {
        chatCompletionRequest.function_call = input.function_call;
      }

      for await (const token of await this.streamChatCompletion(chatCompletionRequest)) {
        res.sse.push({ token });
      }

      res.sse.push({ success: true });
    } catch (err) {
      const error = err as any;

      let message = 'Error with OpenAI API request';

      // https://platform.openai.com/docs/guides/error-codes
      if (error instanceof OpenAI.APIError) {
        if (error.status === 400) {
          message = `Your model: '${model}' may be incompatible or one of your parameters is unknown.`;
        } else if (error.status === 401) {
          message = 'Make sure you are properly signed in.';
        } else if (error.status === 403) {
          message = 'Your token has expired.';
        } else if (error.status === 404) {
          message = `Your model: '${model}' may be incompatible or you may have exhausted your ChatGPT subscription allowance.`;
        } else if (error.status === 429) {
          message =
            'Too many requests, try again later. Exceeded current quota, sent requests too quickly, or overloaded engine.';
        } else if (error.status === 500) {
          message = 'The server had an error while processing your request, please try again.';
        } else if (error.status) {
          message = `${error.status}`;
        }
      }

      const apiMessage =
        error?.response?.data?.error?.message ||
        error?.toString?.() ||
        error?.message ||
        error?.name;
      if (apiMessage) {
        message = `${message ? `${message} ` : ''}
        
${apiMessage}`;
      }

      if (message) {
        console.log(message);
      }

      if (apiMessage.includes('context is required') || apiMessage.includes('Prompt is too long')) {
        res.sse.push({ error: apiMessage, statusCode: 400 }, 'error');
      } else if (error?.status || error?.response?.status) {
        res.sse.push(
          { error: apiMessage, statusCode: error.status || error.response.status },
          'error'
        );
      } else {
        res.sse.push(
          { error: 'Unable to generate AI assisted paragraph.', statusCode: 400 },
          'error'
        );
      }
      res.status(error?.status || error?.response?.status || 400).end();
    }
  }

  public static async streamCompletion(request: CompletionCreateParamsStreaming) {
    const stream = await openai.completions.create({ ...request, stream: true });
    return this.streamResponseData(stream);
  }

  public static async streamChatCompletion(request: ChatCompletionCreateParamsStreaming) {
    const stream = await openai.chat.completions.create({ ...request, stream: true });
    return this.streamResponseData(stream, true /* isChat */);
  }

  public static async *streamResponseData(
    stream: Stream<Completion | ChatCompletionChunk>,
    isChat = false
  ) {
    for await (const part of stream) {
      let token = '';
      if (isChat && (part as ChatCompletionChunk).choices[0].delta.function_call) {
        token = (part as ChatCompletionChunk).choices[0].delta.function_call?.arguments || '';
      } else {
        token = isChat
          ? (part as ChatCompletionChunk).choices[0].delta.content || ''
          : (part as Completion).choices[0].text;
      }
      if (token) {
        yield token;
      }
    }
  }
}
