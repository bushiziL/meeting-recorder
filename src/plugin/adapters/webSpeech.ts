import type { SpeechRecognizer } from '../types';

interface SpeechRecognitionResultItem {
  readonly transcript: string;
  readonly confidence: number;
  readonly isFinal: boolean;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(i: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

class WebSpeechRecognizer implements SpeechRecognizer {
  id = 'web-speech';
  name = '浏览器语音识别';
  description = '使用浏览器原生Web Speech API进行语音识别';
  supportedLanguages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];

  private recognition: SpeechRecognitionInstance | null = null;
  private isInitialized = false;
  private isStarted = false;
  private shouldRestart = false; // 是否应该在 onend 后自动重启
  private restartCount = 0;
  private maxRestarts = 200; // 最多重启次数（约1小时的使用）
  private restartDelay = 100; // 重启延迟 ms
  private currentLang = 'zh-CN';
  private lastTranscriptIndex = 0; // 追踪已处理的 result index

  async init(): Promise<void> {
    // 检查安全上下文（HTTPS 或 localhost）
    if (!window.isSecureContext) {
      throw new Error('浏览器语音识别需要 HTTPS 环境。请使用 https:// 访问，或使用 localhost 本地开发。');
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      throw new Error(
        '当前浏览器不支持语音识别。\n' +
        '请使用 Chrome、Edge 或 Safari 浏览器。\n' +
        'Firefox 不支持 Web Speech API。'
      );
    }

    this.recognition = new SpeechRecognitionClass() as SpeechRecognitionInstance;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.currentLang;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleResult(event);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.handleError(event);
    };

    this.recognition.onend = () => {
      this.handleEnd();
    };

    this.recognition.onstart = () => {
      console.log('[WebSpeech] 识别服务已启动');
      this.isStarted = true;
    };

    this.recognition.onspeechend = () => {
      console.log('[WebSpeech] 检测到语音结束');
      // 不要在这里 stop，让 onend 自动重启
    };

    this.isInitialized = true;
  }

  private handleResult(event: SpeechRecognitionEvent): void {
    if (!this.onresult) return;

    // 只处理新增的 result
    const newResults: string[] = [];
    let hasNewFinal = false;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (i >= this.lastTranscriptIndex) {
        newResults.push(result.transcript);
        if (result.isFinal) {
          hasNewFinal = true;
        }
      }
    }

    this.lastTranscriptIndex = event.results.length;

    // 合并当前所有结果的文本
    const fullTranscript = Array.from(event.results)
      .map(r => r.transcript)
      .join('');

    const latestResult = event.results[event.results.length - 1];

    if (hasNewFinal) {
      // 有新的最终结果
      this.onresult(fullTranscript.trim(), true);
    } else if (fullTranscript.trim()) {
      // 中间结果
      this.onresult(fullTranscript.trim(), false);
    }
  }

  private handleError(event: SpeechRecognitionErrorEvent): void {
    const errorMsg = this.translateError(event.error);
    console.warn(`[WebSpeech] 错误: ${event.error}`, event.message);

    // 某些错误不应该重启
    const noRestartErrors = ['not-allowed', 'service-not-allowed', 'audio-capture'];
    if (noRestartErrors.includes(event.error)) {
      this.shouldRestart = false;
      if (this.onerror) {
        this.onerror(new Error(errorMsg));
      }
      return;
    }

    // 其他错误（如 network、aborted、no-speech）可以继续重启
    if (this.onerror && event.error !== 'no-speech' && event.error !== 'aborted') {
      // no-speech 和 aborted 太常见，不通知用户
      this.onerror(new Error(errorMsg));
    }
  }

  private handleEnd(): void {
    this.isStarted = false;
    console.log(`[WebSpeech] 识别结束 (shouldRestart=${this.shouldRestart}, restartCount=${this.restartCount})`);

    // 自动重启：这是 Web Speech API 正常工作的关键
    // Chrome 会在每次识别完成后 fire onend，需要重新 start
    if (this.shouldRestart && this.restartCount < this.maxRestarts) {
      this.restartCount++;
      const delay = Math.min(this.restartDelay * Math.min(this.restartCount, 5), 1000);
      console.log(`[WebSpeech] ${delay}ms 后自动重启 (第${this.restartCount}次)`);

      setTimeout(() => {
        if (this.shouldRestart && this.recognition) {
          try {
            this.recognition.lang = this.currentLang;
            this.recognition.start();
          } catch (e) {
            // 如果还在 running 状态，先 abort 再 start
            console.warn('[WebSpeech] 重启失败，尝试 abort 后重启');
            try {
              this.recognition.abort();
              setTimeout(() => {
                if (this.shouldRestart && this.recognition) {
                  try {
                    this.recognition.start();
                  } catch (e2) {
                    console.error('[WebSpeech] 重启彻底失败:', e2);
                  }
                }
              }, 200);
            } catch (e3) {
              console.error('[WebSpeech] abort 失败:', e3);
            }
          }
        }
      }, delay);
    }
  }

  private translateError(error: string): string {
    const errorMap: Record<string, string> = {
      'no-speech': '未检测到语音，请对着麦克风说话',
      'aborted': '识别被中断',
      'audio-capture': '无法获取麦克风，请检查麦克风是否已连接',
      'network': '网络错误，语音识别需要网络连接',
      'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
      'service-not-allowed': '语音识别服务不可用，请确保使用 HTTPS 访问',
      'bad-grammar': '语法错误',
      'language-not-supported': '不支持的语言',
    };
    return errorMap[error] || `语音识别错误: ${error}`;
  }

  start(language = 'zh-CN'): void {
    if (!this.isInitialized) {
      throw new Error('识别器未初始化');
    }

    this.currentLang = language;
    this.shouldRestart = true;
    this.restartCount = 0;
    this.lastTranscriptIndex = 0;

    if (this.recognition) {
      this.recognition.lang = language;
      try {
        this.recognition.start();
        console.log('[WebSpeech] 启动识别, lang=' + language);
      } catch (e: any) {
        // 如果已经在运行，先停止再重启
        if (e?.message?.includes('already started') || e?.name === 'InvalidStateError') {
          console.log('[WebSpeech] 已在运行，先 abort 再重启');
          this.recognition.abort();
          setTimeout(() => {
            if (this.recognition && this.shouldRestart) {
              try {
                this.recognition.start();
              } catch (e2) {
                if (this.onerror) this.onerror(e2 as Error);
              }
            }
          }, 300);
        } else {
          if (this.onerror) this.onerror(e as Error);
        }
      }
    }
  }

  stop(): void {
    this.shouldRestart = false; // 停止自动重启
    this.restartCount = 0;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // 可能已经停了，忽略
        try {
          this.recognition.abort();
        } catch {}
      }
    }
    this.isStarted = false;
  }

  destroy(): void {
    this.stop();
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onstart = null;
      this.recognition.onspeechend = null;
    }
    this.recognition = null;
    this.isInitialized = false;
  }

  onresult?: (transcript: string, isFinal: boolean) => void;
  onerror?: (error: Error) => void;
}

export const webSpeechRecognizer = new WebSpeechRecognizer();
export default WebSpeechRecognizer;
