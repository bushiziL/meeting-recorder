import type { LLMAdapter } from '../types';
import { proxyFetch } from '../proxyFetch';

class BaiduLLMAdapter implements LLMAdapter {
  id = 'baidu';
  name = '百度文心一言';
  description = '使用百度文心一言系列模型进行智能对话';
  supportedModels = ['ernie-4.0', 'ernie-3.5', 'ernie-3.0'];
  
  private apiKey = '';
  private secretKey = '';
  private baseUrl = 'https://aip.baidubce.com';
  private accessToken = '';
  private tokenExpireTime = 0;

  async init(options?: { apiKey?: string; baseUrl?: string }): Promise<void> {
    if (options?.apiKey) {
      const [apiKey, secretKey] = options.apiKey.split('|');
      this.apiKey = apiKey || '';
      this.secretKey = secretKey || '';
    }
    if (options?.baseUrl) {
      this.baseUrl = options.baseUrl;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    if (!this.apiKey || !this.secretKey) {
      throw new Error('百度文心一言API密钥未配置');
    }

    const response = await proxyFetch(`${this.baseUrl}/oauth/2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`,
    });

    if (!response.ok) {
      throw new Error('获取百度访问令牌失败');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async chat(
    messages: { role: string; content: string }[],
    model = 'ernie-3.5',
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const token = await this.getAccessToken();

    const response = await proxyFetch(`${this.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.7,
        max_output_tokens: options?.maxTokens ?? 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`百度文心一言API调用失败: ${errorData.error_msg || response.statusText}`);
    }

    const data = await response.json();
    return data.result ?? '';
  }

  async chatStream(
    messages: { role: string; content: string }[],
    model = 'ernie-3.5',
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const token = await this.getAccessToken();

    const response = await proxyFetch(`${this.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${model}_stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`百度文心一言API调用失败: ${errorData.error_msg || response.statusText}`);
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
            if (parsed.result) {
              onChunk(parsed.result);
            }
          } catch {
            continue;
          }
        }
      }
    }
  }
}

export const baiduLLMAdapter = new BaiduLLMAdapter();

export default BaiduLLMAdapter;