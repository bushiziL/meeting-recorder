export interface MeetingRecord {
  id: string;
  title: string;
  description: string;
  segments: SpeechSegment[];
  summary: string;
  todos: TodoItem[];
  projectId?: string;
  phase?: string;
  audioFileName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SpeechSegment {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerRole: string;
  speakerColor?: string;
  time: string;
  original: string;
}

export interface TodoItem {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: '高' | '中' | '低';
  status: '待处理' | '进行中' | '已完成';
}

export interface Speaker {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface LLMProviderConfig {
  id: string;
  provider: 'openai' | 'baidu' | 'aliyun' | 'custom';
  apiKey: string;
  model: string;
  baseUrl: string;
  authType: 'bearer' | 'api-key-header' | 'custom-header';
  authHeader?: string;
  enabled: boolean;
}

export interface SpeechRecognizer {
  id: string;
  name: string;
  description: string;
  supportedLanguages: string[];
  
  init(options?: { apiKey?: string }): Promise<void>;
  
  start(language?: string): void;
  
  stop(): void;
  
  destroy(): void;
  
  onresult?: (transcript: string, isFinal: boolean) => void;
  
  onerror?: (error: Error) => void;
}

export interface LLMAdapter {
  id: string;
  name: string;
  description: string;
  supportedModels: string[];
  
  init(options?: { apiKey?: string; baseUrl?: string; authType?: 'bearer' | 'api-key-header' | 'custom-header'; authHeader?: string }): Promise<void>;
  
  chat(
    messages: { role: string; content: string }[],
    model: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;
  
  chatStream(
    messages: { role: string; content: string }[],
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;
}

export interface StorageAdapter {
  id: string;
  name: string;
  
  init(options?: Record<string, unknown>): Promise<void>;
  
  saveRecord(record: MeetingRecord): Promise<string>;
  
  getRecord(id: string): Promise<MeetingRecord | null>;
  
  getAllRecords(): Promise<MeetingRecord[]>;
  
  updateRecord(record: MeetingRecord): Promise<void>;
  
  deleteRecord(id: string): Promise<void>;
  
  searchRecords(query: string): Promise<MeetingRecord[]>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies?: string[];
  
  extensions?: {
    speechRecognizers?: SpeechRecognizer[];
    llmAdapters?: LLMAdapter[];
    storageAdapters?: StorageAdapter[];
  };
  
  init?: (context: PluginContext) => void;
  
  destroy?: () => void;
}

export interface PluginContext {
  registerSpeechRecognizer(recognizer: SpeechRecognizer): void;
  
  registerLLMAdapter(adapter: LLMAdapter): void;
  
  registerStorageAdapter(adapter: StorageAdapter): void;
  
  on(event: string, handler: (...args: unknown[]) => void): void;
  
  emit(event: string, ...args: unknown[]): void;
  
  getConfig(key: string): unknown;
  
  setConfig(key: string, value: unknown): void;
}

export type EventName = 
  | 'meeting:start'
  | 'meeting:pause'
  | 'meeting:resume'
  | 'meeting:stop'
  | 'transcript:new'
  | 'transcript:update'
  | 'summary:generated'
  | 'record:saved'
  | 'record:deleted';

export interface MeetingEventMap {
  'meeting:start': { timestamp: number };
  'meeting:pause': { timestamp: number };
  'meeting:resume': { timestamp: number };
  'meeting:stop': { timestamp: number; duration: number };
  'transcript:new': { segment: SpeechSegment };
  'transcript:update': { id: string; text: string };
  'summary:generated': { summary: string; todos: TodoItem[] };
  'record:saved': { id: string };
  'record:deleted': { id: string };
}