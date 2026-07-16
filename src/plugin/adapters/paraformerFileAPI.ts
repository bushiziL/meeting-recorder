/**
 * 阿里云 Paraformer 录音文件识别 API（非实时）
 * 
 * 支持说话人分离（diarization_enabled），用于录音结束后按音色自动分配角色。
 * 
 * 流程：
 * 1. 上传录音文件到 OSS 或转为 base64
 * 2. 调用异步识别 API，开启 diarization_enabled
 * 3. 轮询查询结果
 * 4. 解析 speaker_id，返回按说话人分类的识别结果
 */

export interface DiarizationResult {
  speakerId: string;
  text: string;
  beginTime: number;
  endTime: number;
}

export interface FileRecognitionResult {
  success: boolean;
  text: string;
  speakers: DiarizationResult[];
  error?: string;
}

const POLL_INTERVAL = 3000; // 轮询间隔 3 秒
const MAX_POLL_TIME = 300000; // 最多轮询 5 分钟

export class ParaformerFileRecognizer {
  private apiKey: string;
  private baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 对录音文件进行识别（带说话人分离）
   * 
   * @param audioBlob 录音 Blob（webm 格式）
   * @param speakerCount 预期说话人数量（可选，2-100）
   */
  async recognizeWithDiarization(
    audioBlob: Blob,
    speakerCount?: number
  ): Promise<FileRecognitionResult> {
    try {
      // 步骤1：提交异步识别任务
      const taskId = await this.submitTask(audioBlob, speakerCount);
      console.log(`[Paraformer File] 任务已提交, task_id=${taskId}`);

      // 步骤2：轮询等待结果
      const result = await this.pollResult(taskId);
      return result;
    } catch (error) {
      console.error('[Paraformer File] 识别失败:', error);
      return {
        success: false,
        text: '',
        speakers: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * 提交异步识别任务
   */
  private async submitTask(audioBlob: Blob, speakerCount?: number): Promise<string> {
    // 将音频转为 base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64Audio = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const mimeType = audioBlob.type || 'audio/webm';
    const dataUri = `data:${mimeType};base64,${base64Audio}`;

    const body: Record<string, unknown> = {
      model: 'paraformer-v2',
      input: {
        file_urls: [dataUri],
      },
      parameters: {
        diarization_enabled: true,
        speaker_count: speakerCount && speakerCount >= 2 && speakerCount <= 100 ? speakerCount : undefined,
      },
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`提交任务失败(${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // 检查是否有输出
    if (data.output?.task_id) {
      return data.output.task_id;
    }

    // 有些模型可能直接返回结果（同步模式）
    if (data.output?.results) {
      throw new Error('模型返回了同步结果，但当前只支持异步模式');
    }

    throw new Error(data.message || '提交任务失败：未返回 task_id');
  }

  /**
   * 轮询查询识别结果
   */
  private async pollResult(taskId: string): Promise<FileRecognitionResult> {
    const startTime = Date.now();
    const queryUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;

    while (Date.now() - startTime < MAX_POLL_TIME) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`查询任务失败(${response.status})`);
      }

      const data = await response.json();
      const status = data.output?.task_status;

      if (status === 'SUCCEEDED') {
        return this.parseResult(data);
      }

      if (status === 'FAILED') {
        const errMsg = data.output?.results?.[0]?.message || '识别失败';
        throw new Error(errMsg);
      }

      // PENDING / RUNNING → 继续轮询
      console.log(`[Paraformer File] 任务状态: ${status}`);
    }

    throw new Error('识别超时（5分钟）');
  }

  /**
   * 解析识别结果
   */
  private async parseResult(data: Record<string, unknown>): Promise<FileRecognitionResult> {
    const output = data.output as Record<string, unknown> | undefined;
    const results = (output?.results as Array<Record<string, unknown>>) || [];
    const speakers: DiarizationResult[] = [];
    let fullText = '';

    for (const result of results) {
      const transcriptionUrl = result.transcription_url as string;
      
      if (transcriptionUrl) {
        // 从 URL 获取详细结果
        try {
          const transResponse = await fetch(transcriptionUrl);
          const transData = await transResponse.json();
          const transcripts = transData.transcripts || [];

          for (const transcript of transcripts) {
            fullText += (transcript.text || '') + '\n';
            const sentences = transcript.sentences || [];

            for (const sentence of sentences) {
              speakers.push({
                speakerId: `speaker_${sentence.speaker_id ?? 0}`,
                text: sentence.text || '',
                beginTime: sentence.begin_time ?? 0,
                endTime: sentence.end_time ?? 0,
              });
            }
          }
        } catch (error) {
          console.error('[Paraformer File] 获取详细结果失败:', error);
        }
      }
    }

    return {
      success: true,
      text: fullText.trim(),
      speakers,
    };
  }
}
