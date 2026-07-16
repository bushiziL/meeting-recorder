import type { LLMAdapter } from '../types';
import { proxyFetch } from '../proxyFetch';

class CustomLLMAdapter implements LLMAdapter {
  id = 'custom';
  name = '自定义大模型';
  description = '支持接入任何兼容OpenAI格式的自定义大模型API';
  supportedModels: string[] = [];
  
  private apiKey = '';
  private baseUrl = '';
  private authType: 'bearer' | 'api-key-header' | 'custom-header' = 'bearer';
  private authHeader = 'Authorization';

  async init(options?: { apiKey?: string; baseUrl?: string; authType?: 'bearer' | 'api-key-header' | 'custom-header'; authHeader?: string }): Promise<void> {
    if (options?.apiKey) {
      this.apiKey = options.apiKey;
    }
    if (options?.baseUrl) {
      this.baseUrl = options.baseUrl;
    }
    if (options?.authType) {
      this.authType = options.authType;
    }
    if (options?.authHeader) {
      this.authHeader = options.authHeader;
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('自定义大模型API密钥未配置');
    }
    if (!this.baseUrl) {
      throw new Error('自定义大模型API地址未配置');
    }

    let url = this.baseUrl;
    if (!url.endsWith('/chat/completions')) {
      url = url.endsWith('/') 
        ? `${url}chat/completions` 
        : `${url}/chat/completions`;
    }

    console.log('自定义大模型请求:', { url, model, messages: messages.map(m => ({ role: m.role, content: m.content.substring(0, 50) + '...' })) });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else if (this.authType === 'api-key-header') {
      headers['x-api-key'] = this.apiKey;
    } else if (this.authType === 'custom-header') {
      headers[this.authHeader] = this.apiKey;
    }

    const response = await proxyFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4000,
      }),
    });

    console.log('自定义大模型响应状态:', response.status, response.statusText);

    if (!response.ok) {
      let errorMsg = `HTTP错误: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMsg = `自定义大模型API调用失败 (${response.status}): ${errorData.error?.message || errorData.message || errorData.msg || JSON.stringify(errorData)}`;
      } catch {
        try {
          const text = await response.text();
          errorMsg = `自定义大模型API调用失败 (${response.status}): ${text.substring(0, 200)}`;
        } catch {}
      }
      throw new Error(errorMsg);
    }

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      console.log('自定义大模型响应文本:', responseText.substring(0, 500) + '...');
      data = JSON.parse(responseText);
    } catch (e) {
      console.log('响应不是JSON格式，尝试作为纯文本处理');
      return responseText;
    }
    
    console.log('自定义大模型响应数据:', JSON.stringify(data).substring(0, 200) + '...');
    
    if (data.choices && data.choices[0]) {
      return data.choices[0]?.message?.content ?? data.choices[0]?.text ?? '';
    } else if (data.message) {
      return data.message.content ?? data.message ?? '';
    } else if (data.result) {
      return data.result;
    } else if (data.content) {
      return data.content;
    } else {
      throw new Error(`响应格式不符合预期: ${JSON.stringify(data).substring(0, 100)}`);
    }
  }

  async chatStream(
    messages: { role: string; content: string }[],
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('自定义大模型API密钥未配置');
    }
    if (!this.baseUrl) {
      throw new Error('自定义大模型API地址未配置');
    }

    const url = this.baseUrl.endsWith('/') 
      ? `${this.baseUrl}chat/completions` 
      : `${this.baseUrl}/chat/completions`;

    const response = await proxyFetch(url, {
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
      throw new Error(`自定义大模型API调用失败: ${errorData.error?.message || response.statusText}`);
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

export const customLLMAdapter = new CustomLLMAdapter();

export default CustomLLMAdapter;