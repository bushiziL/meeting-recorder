import type { LLMAdapter } from '../types';
import { proxyFetch } from '../proxyFetch';

class OpenAILLMAdapter implements LLMAdapter {
  id = 'openai';
  name = 'OpenAI';
  description = '使用OpenAI GPT系列模型进行智能对话';
  supportedModels = ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'];
  
  private apiKey = '';
  private baseUrl = 'https://api.openai.com';

  async init(options?: { apiKey?: string; baseUrl?: string }): Promise<void> {
    if (options?.apiKey) {
      this.apiKey = options.apiKey;
    }
    if (options?.baseUrl) {
      this.baseUrl = options.baseUrl;
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    model = 'gpt-3.5-turbo',
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API密钥未配置');
    }

    const baseUrl = this.baseUrl.endsWith('/v1') ? this.baseUrl : `${this.baseUrl}/v1`;
    const response = await proxyFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API调用失败: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content ?? '';
  }

  async chatStream(
    messages: { role: string; content: string }[],
    model = 'gpt-3.5-turbo',
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('OpenAI API密钥未配置');
    }

    const baseUrl = this.baseUrl.endsWith('/v1') ? this.baseUrl : `${this.baseUrl}/v1`;
    const response = await proxyFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API调用失败: ${errorData.error?.message || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            continue;
          }
        }
      }
    }
  }
}

export const openaiLLMAdapter = new OpenAILLMAdapter();

export default OpenAILLMAdapter;