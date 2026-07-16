import type { SpeechRecognizer } from '../types';

class WhisperAPIRecognizer implements SpeechRecognizer {
  id = 'whisper-api';
  name = 'Whisper API';
  description = '使用OpenAI Whisper API进行语音识别，支持多语言';
  supportedLanguages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'es-ES', 'ru-RU'];
  
  private apiKey = '';
  private baseUrl = 'https://api.openai.com';
  private isInitialized = false;

  async init(options?: { apiKey?: string; baseUrl?: string }): Promise<void> {
    if (options?.apiKey) {
      this.apiKey = options.apiKey;
    }
    if (options?.baseUrl) {
      this.baseUrl = options.baseUrl;
    }
    this.isInitialized = true;
  }

  start(_language = 'zh-CN'): void {
    if (!this.isInitialized) {
      throw new Error('识别器未初始化');
    }
    console.warn('Whisper API不支持实时流式识别，建议使用浏览器语音识别或上传音频文件后识别');
  }

  stop(): void {
  }

  destroy(): void {
    this.isInitialized = false;
  }

  async recognizeAudio(audioBlob: Blob, language = 'zh-CN'): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('识别器未初始化');
    }
    if (!this.apiKey) {
      throw new Error('Whisper API密钥未配置');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, `audio_${Date.now()}.webm`);
    formData.append('model', 'whisper-1');
    formData.append('language', language.split('-')[0]);

    const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Whisper API调用失败: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.text ?? '';
  }

  onresult?: (transcript: string, isFinal: boolean) => void;
  onerror?: (error: Error) => void;
}

export const whisperAPIRecognizer = new WhisperAPIRecognizer();

export default WhisperAPIRecognizer;