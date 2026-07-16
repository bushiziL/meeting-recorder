import type { LLMAdapter } from '../types';
import { proxyFetch } from '../proxyFetch';

class AliyunLLMAdapter implements LLMAdapter {
  id = 'aliyun';
  name = '阿里通义千问';
  description = '使用阿里通义千问系列模型进行智能对话';
  supportedModels = ['qwen-max', 'qwen-plus', 'qwen-turbo'];
  
  private apiKey = '';
  private baseUrl = 'https://dashscope.aliyuncs.com';

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
    model = 'qwen-plus',
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('阿里通义千问API密钥未配置');
    }

    const response = await proxyFetch(`${this.baseUrl}/api/v1/services/aigc/text-generation/generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable',
      },
      body: JSON.stringify({
        model,
        input: {
          messages,
        },
        parameters: {
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4000,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`阿里通义千问API调用失败: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    return data.output?.text || '';
  }

  async chatStream(
    messages: { role: string; content: string }[],
    model = 'qwen-plus',
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('阿里通义千问API密钥未配置');
    }

    const response = await proxyFetch(`${this.baseUrl}/api/v1/services/aigc/text-generation/generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable',
      },
      body: JSON.stringify({
        model,
        input: {
          messages,
        },
        parameters: {
          temperature: 0.7,
          max_tokens: 4000,
          stream: true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`阿里通义千问API调用失败: ${errorData.message || response.statusText}`);
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
          try {
            const parsed = JSON.parse(data);
            if (parsed.output?.text) {
              onChunk(parsed.output.text);
            }
            if (parsed.finish_reason === 'stop') {
              return;
            }
          } catch {
            continue;
          }
        }
      }
    }
  }
}

export const aliyunLLMAdapter = new AliyunLLMAdapter();

export default AliyunLLMAdapter;