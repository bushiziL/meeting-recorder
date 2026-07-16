import type { SpeechRecognizer } from '../types';

class ParaformerRecognizer implements SpeechRecognizer {
  id = 'paraformer-api';
  name = 'Paraformer API';
  description = '使用阿里云达摩院Paraformer模型进行语音识别，支持实时转写';
  supportedLanguages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'zh-TW', 'zh-HK'];
  
  private apiKey = '';
  private isInitialized = false;
  private wsConnection: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private targetSampleRate = 16000;
  private taskId = '';
  private taskStarted = false;
  private pendingAudioBuffers: ArrayBuffer[] = [];
  private isStopping = false;
  private resampleWarned = false;
  private maxRetries = 2;

  async init(options?: { apiKey?: string; workspaceId?: string }): Promise<void> {
    if (options?.apiKey) {
      this.apiKey = options.apiKey;
    }
    this.isInitialized = true;
  }

  private getLangCode(language: string): string {
    const langMap: Record<string, string> = {
      'zh-CN': 'zh', 'en-US': 'en', 'ja-JP': 'ja',
      'ko-KR': 'ko', 'zh-TW': 'zh', 'zh-HK': 'yue',
    };
    return langMap[language] || 'zh';
  }

  private generateTaskId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 浏览器直连阿里云 Paraformer WebSocket
   * 
   * 两种模型名都尝试：
   * - paraformer-realtime-v2：百炼平台早期模型名（sk-ws- key 兼容性更好）
   * - fun-asr-realtime：阿里云2025年12月后的新默认模型名
   * 
   * 两种 URL 格式：
   * - 通用域名：wss://dashscope.aliyuncs.com/api-ws/v1/inference/?api_key=xxx
   * - 专属域名：wss://{workspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/?api_key=xxx
   */
  private getWsUrl(): string {
    return `wss://dashscope.aliyuncs.com/api-ws/v1/inference/?api_key=${this.apiKey}`;
  }

  start(language = 'zh-CN'): void {
    if (!this.isInitialized) throw new Error('识别器未初始化');
    if (!this.apiKey) throw new Error('Paraformer API密钥未配置');

    this.taskStarted = false;
    this.isStopping = false;
    this.pendingAudioBuffers = [];
    this.resampleWarned = false;

    this.tryConnect(language);
  }

  /**
   * 尝试连接，如果连接失败则自动切换模型名重试
   */
  private tryConnect(language: string, attempt = 0): void {
    this.taskId = this.generateTaskId();
    
    // 两种模型名轮流尝试
    const models = ['paraformer-realtime-v2', 'fun-asr-realtime'];
    const model = models[attempt % models.length];
    
    const wsUrl = this.getWsUrl();
    const maskedUrl = wsUrl.replace(/api_key=.+$/, 'api_key=***');
    console.log(`[Paraformer] 尝试连接(第${attempt + 1}次, 模型=${model}): ${maskedUrl}`);
    
    this.wsConnection = new WebSocket(wsUrl);
    const langCode = this.getLangCode(language);

    let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (connectionTimeout) clearTimeout(connectionTimeout);
      connectionTimeout = null;
    };

    // 10秒内没收到 task-started 就算失败
    connectionTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(`[Paraformer] 第${attempt + 1}次连接超时(10秒内未收到task-started)`);
      this.wsConnection?.close();
      this.wsConnection = null;
      
      // 重试
      if (attempt < this.maxRetries) {
        console.log(`[Paraformer] 切换模型重试...`);
        this.tryConnect(language, attempt + 1);
      } else {
        if (this.onerror) this.onerror(new Error('连接超时，无法启动语音识别任务。请检查网络连接和API密钥。'));
      }
    }, 10000);

    this.wsConnection.onopen = () => {
      console.log(`[Paraformer] WebSocket 已连接，发送 run-task (model=${model})`);
      this.wsConnection?.send(JSON.stringify({
        header: {
          action: 'run-task',
          task_id: this.taskId,
          streaming: 'duplex',
        },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: model,
          parameters: {
            sample_rate: 16000,
            format: 'pcm',
            disfluency_removal_enabled: false,
            language_hints: [langCode],
          },
          input: {},
        },
      }));
    };

    this.wsConnection.onmessage = (event) => {
      try {
        if (typeof event.data !== 'string') return;
        const data = JSON.parse(event.data);

        if (data.type === 'error') {
          console.error('[Paraformer] 服务端错误:', data.message);
          cleanup();
          settled = true;
          if (this.onerror) this.onerror(new Error(data.message || '语音识别错误'));
          return;
        }

        const eventType = data.header?.event;

        switch (eventType) {
          case 'task-started':
            cleanup();
            settled = true;
            this.taskStarted = true;
            console.log(`[Paraformer] ✅ 任务已启动 (model=${model})，发送缓存音频: ${this.pendingAudioBuffers.length} 块`);
            console.log(`[Paraformer] ✅ 任务已启动 (model=${model})，发送缓存音频: ${this.pendingAudioBuffers.length} 块`);
            for (const buffer of this.pendingAudioBuffers) {
              if (this.wsConnection?.readyState === WebSocket.OPEN) {
                this.wsConnection.send(buffer);
              }
            }
            this.pendingAudioBuffers = [];
            break;
          case 'result-generated':
            const sentence = data.payload?.output?.sentence;
            const text = sentence?.text || '';
            const isFinal = sentence?.sentence_end || sentence?.is_final || false;
            if (this.onresult && text.trim()) {
              this.onresult(text, isFinal);
            }
            break;
          case 'task-finished':
            console.log('[Paraformer] 任务已完成');
            break;
          case 'task-failed':
            cleanup();
            settled = true;
            const errMsg = data.header?.error_message || '任务失败';
            console.error(`[Paraformer] ❌ 任务失败 (model=${model}):`, errMsg);
            // 如果是模型相关的错误，尝试另一个模型
            if ((errMsg.includes('model') || errMsg.includes('模型')) && attempt < this.maxRetries) {
              console.log(`[Paraformer] 模型错误，切换重试...`);
              this.wsConnection?.close();
              this.wsConnection = null;
              this.tryConnect(language, attempt + 1);
            } else {
              if (this.onerror) this.onerror(new Error(errMsg));
            }
            break;
          default:
            if (eventType) {
              console.warn('[Paraformer] 未知事件:', eventType);
            }
        }
      } catch (error) {
        console.error('[Paraformer] 消息解析失败:', error);
      }
    };

    this.wsConnection.onerror = () => {
      console.error('[Paraformer] WebSocket onerror');
    };

    this.wsConnection.onclose = (event) => {
      cleanup();
      const wasStarted = this.taskStarted;
      this.wsConnection = null;
      this.taskStarted = false;

      // 正常关闭
      if (event.code === 1000 || event.code === 1001) {
        console.log(`[Paraformer] WebSocket 正常关闭(code=${event.code})`);
        return;
      }

      // 非正常关闭且任务未启动 → 尝试切换模型重试
      if (!wasStarted && !settled) {
        settled = true;
        if (attempt < this.maxRetries) {
          console.warn(`[Paraformer] 连接异常关闭(code=${event.code})，切换模型重试...`);
          this.tryConnect(language, attempt + 1);
          return;
        }
      }

      // 所有重试都失败了
      if (!settled) {
        settled = true;
        let errorMsg = '';
        if (event.code === 1005) {
          errorMsg = `连接被服务端断开(1005)。可能原因：1) API密钥无效 2) 网络不稳定 3) 服务端暂时不可用。请稍后重试，或检查API密钥是否正确。`;
        } else if (event.code === 1006) {
          errorMsg = '连接异常中断(1006)，通常是网络不稳定或被防火墙拦截。';
        } else if (event.code === 1008) {
          errorMsg = `服务端拒绝连接: ${event.reason || 'API密钥无效或权限不足'}`;
        } else {
          errorMsg = `WebSocket关闭(code=${event.code}): ${event.reason || '未知原因'}`;
        }
        console.error(`[Paraformer] ❌ ${errorMsg}`);
        if (this.onerror) this.onerror(new Error(errorMsg));
      }
    };
  }

  async startWithStream(stream: MediaStream, language = 'zh-CN'): Promise<void> {
    this.start(language);
    await this.waitForTaskStarted();
    
    if (!this.taskStarted) {
      throw new Error('WebSocket 任务未能在超时内启动，请检查 API 密钥和网络连接');
    }
    
    this.audioContext = new AudioContext({ sampleRate: this.targetSampleRate });
    const actualSampleRate = this.audioContext.sampleRate;
    console.log(`[Paraformer] AudioContext 采样率: 请求=${this.targetSampleRate}, 实际=${actualSampleRate}`);
    
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    
    const bufferSize = 4096;
    this.audioProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    
    const sampleRate = actualSampleRate;
    
    this.audioProcessor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      this.sendAudioData(inputData, sampleRate);
    };
    
    this.mediaStreamSource.connect(this.audioProcessor);
    this.audioProcessor.connect(this.audioContext.destination);
  }

  async recognizeAudioFile(file: File | Blob, language = 'zh-CN'): Promise<void> {
    if (!this.apiKey) throw new Error('Paraformer API密钥未配置');

    const arrayBuffer = await file.arrayBuffer();
    const tempAudioContext = new AudioContext({ sampleRate: 16000 });
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await tempAudioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      await tempAudioContext.close();
      throw new Error('音频文件解码失败');
    }
    await tempAudioContext.close();

    const channelData = audioBuffer.getChannelData(0);
    const int16Data = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    this.isInitialized = true;
    this.start(language);
    await this.waitForTaskStarted();
    
    if (!this.taskStarted) {
      throw new Error('任务启动超时，请检查 API 密钥');
    }

    const chunkSize = 4096;
    for (let offset = 0; offset < int16Data.length; offset += chunkSize) {
      const chunk = int16Data.slice(offset, offset + chunkSize);
      if (this.wsConnection?.readyState === WebSocket.OPEN) {
        this.wsConnection.send(chunk.buffer);
      }
      await new Promise(r => setTimeout(r, 128));
    }

    this.stop();
  }

  private waitForTaskStarted(): Promise<void> {
    return new Promise((resolve) => {
      if (this.taskStarted) { resolve(); return; }
      const checkInterval = setInterval(() => {
        if (this.taskStarted || !this.wsConnection) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(checkInterval); resolve(); }, 15000);
    });
  }

  private sendAudioData(inputData: Float32Array, inputSampleRate?: number): void {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) return;

    const rate = inputSampleRate || this.targetSampleRate;
    let pcmData: Float32Array;
    
    if (rate !== this.targetSampleRate) {
      const ratio = rate / this.targetSampleRate;
      const newLength = Math.round(inputData.length / ratio);
      pcmData = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
        const fraction = srcIndex - srcIndexFloor;
        pcmData[i] = inputData[srcIndexFloor] * (1 - fraction) + inputData[srcIndexCeil] * fraction;
      }
      if (!this.resampleWarned) {
        console.warn(`[Paraformer] ⚠️ 浏览器实际采样率为${rate}Hz，已自动重采样到16000Hz`);
        this.resampleWarned = true;
      }
    } else {
      pcmData = inputData;
    }

    const int16Array = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const buffer = int16Array.buffer;
    if (!this.taskStarted) {
      this.pendingAudioBuffers.push(buffer);
      if (this.pendingAudioBuffers.length > 100) this.pendingAudioBuffers.shift();
      return;
    }
    this.wsConnection.send(buffer);
  }

  stop(): void {
    if (this.isStopping) return;
    this.isStopping = true;

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      try {
        this.wsConnection.send(JSON.stringify({
          header: { action: 'finish-task', task_id: this.taskId, streaming: 'duplex' },
          payload: { input: {} },
        }));
      } catch { /* ignore */ }
      setTimeout(() => {
        this.wsConnection?.close();
        this.wsConnection = null;
      }, 2000);
    }

    if (this.audioProcessor) { this.audioProcessor.disconnect(); this.audioProcessor = null; }
    if (this.mediaStreamSource) { this.mediaStreamSource.disconnect(); this.mediaStreamSource = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.taskStarted = false;
    this.pendingAudioBuffers = [];
  }

  destroy(): void {
    this.stop();
    this.isInitialized = false;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) return { success: false, message: 'API密钥未配置' };

    const models = ['paraformer-realtime-v2', 'fun-asr-realtime'];
    
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const result = await this.testConnectionWithModel(model);
      if (result.success) return result;
      // 如果第一个模型失败了，继续尝试第二个
      if (i === 0 && !result.success) {
        console.log(`[Paraformer] 模型 ${model} 测试失败，尝试 ${models[1]}...`);
      }
    }
    
    return { success: false, message: '两个模型均连接失败，请检查API密钥和网络' };
  }

  private testConnectionWithModel(model: string): Promise<{ success: boolean; message: string }> {
    const wsUrl = this.getWsUrl();

    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      let timeout: ReturnType<typeof setTimeout>;
      let resolved = false;

      const done = (result: { success: boolean; message: string }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        try { ws.close(); } catch {}
        resolve(result);
      };

      timeout = setTimeout(() => {
        done({ success: false, message: `${model}: 连接超时` });
      }, 10000);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          header: {
            action: 'run-task',
            task_id: this.generateTaskId(),
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: model,
            parameters: {
              sample_rate: 16000,
              format: 'pcm',
              disfluency_removal_enabled: false,
              language_hints: ['zh'],
            },
            input: {},
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') return;
          const data = JSON.parse(event.data);

          if (data.type === 'error') {
            done({ success: false, message: `${model}: ${data.message || '错误'}` });
            return;
          }
          const eventType = data.header?.event;
          if (eventType === 'task-started') {
            done({ success: true, message: `连接测试成功！(模型: ${model}) API密钥有效，Paraformer服务可用` });
          } else if (eventType === 'task-failed') {
            done({ success: false, message: `${model}: ${data.header?.error_message || '连接测试失败'}` });
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => done({ success: false, message: `${model}: WebSocket连接错误` });
      ws.onclose = (event) => {
        if (!resolved) {
          done({ success: false, message: `${model}: 连接关闭(code=${event.code})` });
        }
      };
    });
  }

  onresult?: (transcript: string, isFinal: boolean) => void;
  onerror?: (error: Error) => void;
}

export const paraformerRecognizer = new ParaformerRecognizer();
export default ParaformerRecognizer;
