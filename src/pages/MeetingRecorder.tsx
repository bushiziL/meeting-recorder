import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Archive,
  Bot,
  Briefcase,
  CalendarCheck,
  CheckCircle,
  Clock,
  FileAudio,
  FileText,
  Languages,
  Link,
  Mail,
  Mic,
  Pause,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Shield,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UploadCloud,
  UserRound,
  Video,
  X,
  Settings,
  Download,
  FolderOpen,
  History,
  Search,
  Copy,
  FileDown,
  FileOutput,
  Zap,
} from 'lucide-react';
import {
  pluginManager,
  indexedDBStorageAdapter,
  webSpeechRecognizer,
  whisperAPIRecognizer,
  paraformerRecognizer,
  openaiLLMAdapter,
  baiduLLMAdapter,
  aliyunLLMAdapter,
  customLLMAdapter,
} from '../plugin';
import type { MeetingRecord, LLMProviderConfig } from '../plugin/types';
import { copyAsMarkdown, exportAsWord, exportAsPDF } from '../utils/exportUtils';
import { Onboarding } from '../components/Onboarding';
import { ParaformerFileRecognizer } from '../plugin/adapters/paraformerFileAPI';

const pluginFeatures = [
  { id: 'L1-001', name: '文件拖入上传', priority: 'P0', description: '支持拖拽或点击上传，支持 PDF、Word、Excel、图片、文本、邮件导出等格式', icon: UploadCloud },
  { id: 'L1-002', name: '实时语音输入', priority: 'P0', description: '麦克风语音实时识别转为文字流，支持关联项目和会议', icon: Mic },
  { id: 'L1-003', name: '实时视频输入', priority: 'P2', description: '摄像头视频实时识别转为文字流', icon: Video },
  { id: 'L1-004', name: '批量导入', priority: 'P1', description: '批量上传音频文件（.mp3/.wav）或视频文件（.mp4/.mov）', icon: FileAudio },
  { id: 'L1-005', name: '系统对接 API', priority: 'P1', description: '支持企业微信文档、钉钉文档、Confluence 等系统的 API 对接，定时拉取或事件触发同步', icon: Link },
  { id: 'L1-006', name: '对话式录入', priority: 'P0', description: '提供对话界面，用户直接描述问题和解决过程，系统引导按六字段结构补充信息', icon: Bot },
  { id: 'L1-007', name: '邮件捕获', priority: 'P2', description: '自动解析接收邮箱的邮件内容及附件，纳入会议资料库', icon: Mail },
  { id: 'L1-008', name: '上传进度展示', priority: 'P0', description: '显示文件上传进度，上传完成后自动进入处理流程', icon: Clock },
  { id: 'L1-009', name: '文件大小限制', priority: 'P0', description: '超过 50MB 的文件提示压缩后重试', icon: ShieldCheck },
  { id: 'L1-010', name: '原始副本保留', priority: 'P0', description: '对上传文件保留原始副本作为可追溯来源', icon: Archive },
  { id: 'L1-011', name: '会议录音控制', priority: 'P0', description: '支持开始录音、暂停录音、终止录音、重置录音并生成语音文件', icon: Mic },
  { id: 'L1-012', name: '实时转写翻译', priority: 'P0', description: '录音过程中实时生成转写文本和翻译内容，支持会后修订', icon: FileText },
  { id: 'L1-013', name: '角色发言整理', priority: 'P1', description: '按客户、专家、项目经理、研发人员等角色整理录音内容，支持人工修改角色信息', icon: UserRound },
  { id: 'L1-014', name: '会议纪要生成', priority: 'P0', description: '录音结束后一键生成会议纪要，包含背景、讨论重点、关键结论、分歧点和风险项', icon: CalendarCheck },
  { id: 'L1-015', name: '待办事项生成', priority: 'P0', description: '从会议纪要中自动生成待办事项，并支持关联到当前项目或指定任务', icon: CheckCircle },
  { id: 'L1-016', name: '项目关联输入', priority: 'P0', description: '所有上传、录音、对话、邮件、系统同步数据均支持关联项目、阶段、任务和来源标签', icon: Briefcase },
  { id: 'L1-017', name: '来源片段追溯', priority: 'P1', description: '纪要、待办、案例字段可追溯到原始录音片段、发言人或文件位置', icon: Link },
];

const priorityStyle: Record<string, string> = {
  P0: 'bg-red-50 text-red-600 border-red-100',
  P1: 'bg-amber-50 text-amber-600 border-amber-100',
  P2: 'bg-blue-50 text-blue-600 border-blue-100',
};

type RecordingState = 'idle' | 'recording' | 'paused' | 'finished';

interface Speaker {
  id: number;
  name: string;
  role: string;
}

interface SpeechSegment {
  id: number;
  speakerId: number;
  time: string;
  original: string;
}

interface TodoItem {
  id: number;
  title: string;
  owner: string;
  dueDate: string;
  priority: '高' | '中' | '低';
}

const initialSpeakers: Speaker[] = [
  { id: 1, name: '张工', role: '研发负责人' },
  { id: 2, name: '李经理', role: '项目经理' },
  { id: 3, name: '王老师', role: '技术顾问' },
];

const projectOptions = [
  { id: 1, name: '产品研发周会' },
  { id: 2, name: '客户需求评审' },
  { id: 3, name: '技术方案讨论' },
  { id: 4, name: '项目进度同步' },
];

const phaseOptions = [
  { value: 'discussion', label: '讨论' },
  { value: 'decision', label: '决策' },
  { value: 'review', label: '评审' },
  { value: 'followup', label: '跟进' },
];

const llmProviderOptions = [
  { value: 'openai', label: 'OpenAI GPT', models: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'], baseUrl: 'https://api.openai.com/v1' },
  { value: 'baidu', label: '百度文心一言', models: ['ernie-4.0', 'ernie-3.5', 'ernie-3.0'], baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat' },
  { value: 'aliyun', label: '阿里通义千问', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'custom', label: '自定义大模型', models: [], baseUrl: '' },
];

/** 会议纪要模板 */
interface SummaryTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** LLM 模式下的 prompt 指令 */
  llmPrompt: string;
  /** 无 LLM 时的本地模板（函数，接收发言内容） */
  fallback: (content: string) => string;
}

const summaryTemplates: SummaryTemplate[] = [
  {
    id: 'general',
    name: '通用会议',
    icon: '📋',
    description: '适用于大多数会议场景',
    llmPrompt: `请按照以下格式输出：

## 会议主题
（自动识别会议主题）

## 会议背景
（简要描述会议背景和目的）

## 讨论重点
（列出主要讨论内容，分点描述）

## 关键结论
（总结会议达成的共识和决策）

## 分歧点
（记录未达成一致的问题）

## 风险项
（识别潜在风险和需要关注的问题）

## 待办事项
- [ ] 事项1（负责人，截止日期，优先级）
- [ ] 事项2（负责人，截止日期，优先级）`,
    fallback: (content: string) => `会议主题：项目讨论会议

一、会议背景
本次会议围绕项目进展、技术方案和后续计划展开，重点关注问题识别、资源协调和风险管控。

二、角色发言摘要
${content}

三、会议结论
1. 当前讨论内容需要进一步细化并形成可执行方案。
2. 后续需要补充相关数据和验收标准。
3. 建议将本次会议纪要分发给参会人员，跟进待办事项。`,
  },
  {
    id: 'tech-review',
    name: '技术评审',
    icon: '🔧',
    description: '方案对比、技术风险、评审结论',
    llmPrompt: `这是一次技术评审会议，请按照以下格式输出：

## 评审主题
（自动识别本次评审的技术主题）

## 评审背景
（为什么做这次评审，要解决什么技术问题）

## 方案对比
（列出讨论的各个技术方案，从可行性、复杂度、成本等维度对比）

| 方案 | 优势 | 劣势 | 风险 |
|------|------|------|------|
| 方案A | ... | ... | ... |
| 方案B | ... | ... | ... |

## 技术风险
（识别技术债务、兼容性、性能、安全等风险点）

## 评审结论
（明确是否通过、条件通过还是打回重做，给出评审意见）

## 遗留问题
（本次未解决的问题，需后续跟进）

## 待办事项
- [ ] 事项1（负责人，截止日期，优先级）
- [ ] 事项2（负责人，截止日期，优先级）`,
    fallback: (content: string) => `评审主题：技术方案评审会议

一、评审背景
本次会议对技术方案进行评审，评估可行性、风险和资源需求。

二、发言记录
${content}

三、评审结论
1. 需要进一步验证关键技术方案的可行性。
2. 补充性能测试数据和安全评估。
3. 评审意见将在补充材料后复核确认。`,
  },
  {
    id: 'weekly',
    name: '项目周会',
    icon: '📅',
    description: '进度同步、阻塞项、下周计划',
    llmPrompt: `这是一次项目周会，请按照以下格式输出：

## 项目名称
（自动识别项目名称）

## 本周进展
（按模块或任务列出本周完成的工作和进度百分比）

| 模块/任务 | 负责人 | 进度 | 状态 |
|-----------|--------|------|------|
| ... | ... | ... | 🟢正常/🟡延期/🔴阻塞 |

## 阻塞与风险
（列出影响进度的问题和风险，标注严重程度）

## 需协调资源
（需要其他团队或管理层支持的事项）

## 下周计划
（列出下周重点工作和目标）

## 待办事项
- [ ] 事项1（负责人，截止日期，优先级）
- [ ] 事项2（负责人，截止日期，优先级）`,
    fallback: (content: string) => `项目名称：项目周会同步

一、本周进展
${content}

二、阻塞与风险
1. 部分任务存在依赖阻塞，需协调资源。
2. 需关注关键路径上的任务进度。

三、下周计划
1. 推进受阻任务，明确责任人。
2. 完成本阶段交付物的验收。`,
  },
  {
    id: 'customer',
    name: '客户访谈',
    icon: '🤝',
    description: '需求记录、痛点分析、后续跟进',
    llmPrompt: `这是一次客户访谈/沟通会议，请按照以下格式输出：

## 访谈对象
（自动识别客户/访谈对象信息）

## 访谈目的
（本次访谈的目标是什么）

## 客户需求
（按优先级列出客户提出的需求和期望）

| 需求 | 优先级 | 当前状态 | 客户期望 |
|------|--------|----------|----------|
| ... | P0/P1/P2 | ... | ... |

## 痛点与反馈
（客户表达的不满、困难和改进建议）

## 承诺事项
（我方在会议中做出的承诺，含时间节点）

## 遗留问题
（客户提出但本次未回答的问题）

## 待办事项
- [ ] 事项1（负责人，截止日期，优先级）
- [ ] 事项2（负责人，截止日期，优先级）`,
    fallback: (content: string) => `访谈主题：客户需求沟通

一、访谈背景
本次会议与客户就需求和方案进行沟通，确认关键诉求和后续计划。

二、沟通记录
${content}

三、客户需求
1. 明确核心功能需求和验收标准。
2. 确认交付时间节点和优先级。

四、后续跟进
1. 整理客户需求清单并内部对齐。
2. 制定明确的交付和反馈计划。`,
  },
];

const mockSpeech = [
  { original: '当前版本的主要问题是性能优化后，内存占用会明显上升，需要同步评估。' },
  { original: '我建议先把核心需求列出来，再确定优先级和排期，确保关键功能先上线。' },
  { original: '客户比较关注方案能不能按时交付，所以成本、周期和验收标准要同步确认。' },
  { original: '下一步需要补充测试数据，重点验证高并发场景下的系统稳定性。' },
];

const speakerColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function MeetingRecorder() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [speakers, setSpeakers] = useState<Speaker[]>(initialSpeakers);
  // 左侧：连贯的实时文本（不按角色区分）
  const [realtimeText, setRealtimeText] = useState<string>('');
  // 右侧：按角色区分的完整句子
  const [speechSegments, setSpeechSegments] = useState<SpeechSegment[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFileName, setAudioFileName] = useState('');
  const [notice, setNotice] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [draftProjectId, setDraftProjectId] = useState(1);
  const [draftPhase, setDraftPhase] = useState('problemDefinition');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftTodos, setDraftTodos] = useState<TodoItem[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState(initialSpeakers[0].id);
  
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('general');
  const [meetingHistory, setMeetingHistory] = useState<MeetingRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('meeting-recorder-onboarded');
  });
  const [llmConfig, setLlmConfig] = useState<LLMProviderConfig>({
    id: 'default',
    provider: 'openai',
    apiKey: 'sk-J4xkFvHc4RKe-eaxzFiycA',
    model: 'GLM-5.1',
    baseUrl: 'https://maas.itjob365.com/ximu/model/v1',
    authType: 'bearer',
    authHeader: 'Authorization',
    enabled: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<MeetingRecord | null>(null);
  const [showRecordDetail, setShowRecordDetail] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error' | 'loading'; message: string; response?: string } | null>(null);
  const [speechTestResult, setSpeechTestResult] = useState<{ status: 'success' | 'error' | 'loading'; message: string } | null>(null);
  const [showWebSpeechWarning, setShowWebSpeechWarning] = useState(false);
  const [isDiarizing, setIsDiarizing] = useState(false);
  const audioBlobRef = useRef<Blob | null>(null);
  const webSpeechTimeoutRef = useRef<number | null>(null);
  const webSpeechGotResultRef = useRef(false);

  const handleOnboardingComplete = (mode: 'free' | 'pro') => {
    localStorage.setItem('meeting-recorder-onboarded', 'true');
    setShowOnboarding(false);
    if (mode === 'free') {
      // 切换到浏览器语音识别
      setSpeechConfig(prev => ({ ...prev, recognizer: 'web-speech' }));
    } else {
      // 高精度模式，打开设置页让用户填 Key
      setShowSettings(true);
    }
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('meeting-recorder-onboarded', 'true');
    setShowOnboarding(false);
  };
  const [speechConfig, setSpeechConfig] = useState<{
    recognizer: 'web-speech' | 'paraformer-api';
    apiKey: string;
    baseUrl: string;
    workspaceId: string;
    language: string;
  }>({
    recognizer: 'paraformer-api',
    apiKey: 'sk-ws-H.EDLMYLP.PfuU.MEUCIQDFfLQq4rEO3oK2vPo61nw8VRYiJcO3nBAR19woD2d8xgIgVuonqr7ff21nLF1pjgY-6p9258s7zWk9lWGhCclESZE',
    baseUrl: 'https://api.openai.com',
    workspaceId: '',
    language: 'zh-CN',
  });

  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioUploadInputRef = useRef<HTMLInputElement | null>(null);
  const currentSpeakerIdRef = useRef(initialSpeakers[0].id);
  const recordingStateRef = useRef<RecordingState>('idle');
  const durationRef = useRef(0);
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  const speakersRef = useRef<Speaker[]>(initialSpeakers);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    speechSegmentsRef.current = speechSegments;
  }, [speechSegments]);

  useEffect(() => {
    speakersRef.current = speakers;
  }, [speakers]);

  useEffect(() => {
    currentSpeakerIdRef.current = currentSpeakerId;
  }, [currentSpeakerId]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopTracks();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      webSpeechRecognizer.destroy();
      paraformerRecognizer.destroy();
    };
  }, [audioUrl]);

  const onTranscriptResult = async (transcript: string, isFinal: boolean) => {
    if (!transcript.trim()) return;
    
    // 标记已收到语音识别结果，用于检测 web-speech 是否工作
    webSpeechGotResultRef.current = true;
    if (webSpeechTimeoutRef.current) {
      clearTimeout(webSpeechTimeoutRef.current);
      webSpeechTimeoutRef.current = null;
    }
    setShowWebSpeechWarning(false);
    
    const speaker = speakersRef.current.find(s => s.id === currentSpeakerIdRef.current) || speakersRef.current[0];
    const minutes = Math.floor(durationRef.current / 60).toString().padStart(2, '0');
    const seconds = (durationRef.current % 60).toString().padStart(2, '0');
    
    if (isFinal) {
      // 完整句子：替换左侧最后一行（中间结果→最终结果），并换行准备下一句
      setRealtimeText(prev => {
        const lines = prev.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          // 替换最后一行（中间结果→最终结果）
          lines[lines.length - 1] = transcript.trim();
        } else {
          lines.push(transcript.trim());
        }
        // 添加空行占位，下一句中间结果会替换它
        lines.push('');
        return lines.join('\n');
      });
      
      // 右侧：只有完整句子才按角色添加
      const segmentId = Date.now();
      setSpeechSegments(prev => [
        ...prev,
        {
          id: segmentId,
          speakerId: speaker.id,
          time: `${minutes}:${seconds}`,
          original: transcript.trim(),
        },
      ]);
    } else {
      // 中间结果：替换左侧最后一行（当前正在识别的句子）
      setRealtimeText(prev => {
        const lines = prev.split('\n');
        if (lines.length > 0) {
          // 替换最后一行（可能是空行占位或之前的中间结果）
          lines[lines.length - 1] = transcript.trim();
          return lines.join('\n');
        }
        return transcript.trim();
      });
    }
  };

  useEffect(() => {
    const initPluginSystem = async () => {
      try {
        pluginManager.loadConfig();
        
        await indexedDBStorageAdapter.init();
        pluginManager.registerStorageAdapter(indexedDBStorageAdapter);
        
        pluginManager.registerSpeechRecognizer(webSpeechRecognizer);
        pluginManager.registerSpeechRecognizer(whisperAPIRecognizer);
        pluginManager.registerSpeechRecognizer(paraformerRecognizer);
        pluginManager.registerLLMAdapter(openaiLLMAdapter);
        pluginManager.registerLLMAdapter(baiduLLMAdapter);
        pluginManager.registerLLMAdapter(aliyunLLMAdapter);
        pluginManager.registerLLMAdapter(customLLMAdapter);
        
        await webSpeechRecognizer.init();
        await whisperAPIRecognizer.init();
        await paraformerRecognizer.init();
        
        const onTranscriptError = (error: Error) => {
          console.error('语音识别错误:', error);
          showNotice(`语音识别错误: ${error.message}`);
        };
        
        webSpeechRecognizer.onresult = onTranscriptResult;
        webSpeechRecognizer.onerror = onTranscriptError;
        whisperAPIRecognizer.onresult = onTranscriptResult;
        whisperAPIRecognizer.onerror = onTranscriptError;
        paraformerRecognizer.onresult = onTranscriptResult;
        paraformerRecognizer.onerror = (error: Error) => {
          console.error('Paraformer识别错误:', error);
          showNotice(`识别错误: ${error.message}`);
        };
        
        const savedConfig = pluginManager.getConfig('llmConfig') as LLMProviderConfig;
        const records = await indexedDBStorageAdapter.getAllRecords();
        
        if (savedConfig) {
          setLlmConfig(savedConfig);
        }
        setMeetingHistory(records.reverse());
      } catch (error) {
        console.error('插件系统初始化失败:', error);
        showNotice('插件系统初始化失败，部分功能可能受限');
      }
    };
    
    initPluginSystem();
  }, []);

  const loadMeetingHistory = async () => {
    try {
      const records = await indexedDBStorageAdapter.getAllRecords();
      setMeetingHistory(records.reverse());
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  };

  const saveMeetingRecord = async () => {
    if (speechSegments.length === 0) {
      showNotice('没有可保存的会议内容');
      return;
    }

    const record: MeetingRecord = {
      id: Date.now().toString(),
      title: `会议记录 ${new Date().toLocaleString()}`,
      description: '',
      segments: speechSegments.map(s => ({
        id: s.id.toString(),
        speakerId: s.speakerId.toString(),
        speakerName: getSpeakerLabel(s.speakerId),
        speakerRole: speakers.find(sp => sp.id === s.speakerId)?.role || '',
        speakerColor: speakerColors[s.speakerId % speakerColors.length],
        time: s.time,
        original: s.original,
      })),
      summary: draftSummary,
      todos: draftTodos.map(t => ({
        id: t.id.toString(),
        title: t.title,
        owner: t.owner,
        dueDate: t.dueDate,
        priority: t.priority as '高' | '中' | '低',
        status: '待处理',
      })),
      projectId: draftProjectId.toString(),
      phase: draftPhase,
      audioFileName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await indexedDBStorageAdapter.saveRecord(record);
      showNotice('会议记录已保存');
      await loadMeetingHistory();
    } catch (error) {
      console.error('保存会议记录失败:', error);
      showNotice('保存会议记录失败');
    }
  };

  const deleteMeetingRecord = async (id: string) => {
    try {
      await indexedDBStorageAdapter.deleteRecord(id);
      showNotice('会议记录已删除');
      await loadMeetingHistory();
    } catch (error) {
      console.error('删除会议记录失败:', error);
      showNotice('删除会议记录失败');
    }
  };

  const exportMeetingRecord = (record: MeetingRecord) => {
    const dataStr = JSON.stringify(record, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.title}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('会议记录已导出');
  };

  /** 从当前草稿状态构建 MeetingRecord（用于导出） */
  const buildDraftRecord = (): MeetingRecord => ({
    id: '',
    title: `会议记录 ${new Date().toLocaleString()}`,
    description: '',
    segments: speechSegments.map(s => ({
      id: s.id.toString(),
      speakerId: s.speakerId.toString(),
      speakerName: getSpeakerLabel(s.speakerId),
      speakerRole: speakers.find(sp => sp.id === s.speakerId)?.role || '',
      speakerColor: speakerColors[s.speakerId % speakerColors.length],
      time: s.time,
      original: s.original,
    })),
    summary: draftSummary,
    todos: draftTodos.map(t => ({
      id: t.id.toString(),
      title: t.title,
      owner: t.owner,
      dueDate: t.dueDate,
      priority: t.priority as '高' | '中' | '低',
      status: '待处理' as const,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const importMeetingRecord = async (file: File) => {
    try {
      const text = await file.text();
      const record = JSON.parse(text) as MeetingRecord;
      
      const existing = await indexedDBStorageAdapter.getRecord(record.id);
      if (existing) {
        record.id = Date.now().toString();
      }
      
      record.createdAt = Date.now();
      record.updatedAt = Date.now();
      
      await indexedDBStorageAdapter.saveRecord(record);
      showNotice('会议记录已导入');
      await loadMeetingHistory();
    } catch (error) {
      console.error('导入会议记录失败:', error);
      showNotice('导入会议记录失败，请确保文件格式正确');
    }
  };

  const formattedDuration = useMemo(() => {
    const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
    const seconds = (duration % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [duration]);

  const statusText: Record<RecordingState, string> = {
    idle: '待开始',
    recording: '录音中',
    paused: '已暂停',
    finished: '已终止',
  };

  const statusDotClass: Record<RecordingState, string> = {
    idle: 'bg-slate-300',
    recording: 'bg-red-500 animate-pulse',
    paused: 'bg-amber-500',
    finished: 'bg-emerald-500',
  };

  const statusBadgeClass: Record<RecordingState, string> = {
    idle: 'bg-slate-100 text-slate-600',
    recording: 'bg-red-50 text-red-700',
    paused: 'bg-amber-50 text-amber-700',
    finished: 'bg-emerald-50 text-emerald-700',
  };

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  }, []);

  const stopTimer = () => {
    if (!timerRef.current) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopTracks = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  };

  const resetAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl('');
    setAudioFileName('');
    setRealtimeText('');
    setSpeechSegments([]);
    audioChunksRef.current = [];
  };

  const createAudioFile = () => {
    if (audioChunksRef.current.length === 0) {
      stopTracks();
      return;
    }

    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioBlobRef.current = blob; // 保存 blob 用于后续说话人识别
    const nextUrl = URL.createObjectURL(blob);
    setAudioUrl(nextUrl);
    setAudioFileName(`会议录音_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`);
    stopTracks();
    showNotice('录音已终止，语音文件已生成');
  };

  const appendMockSpeech = () => {
    if (recordingStateRef.current !== 'recording') return;

    const sample = mockSpeech[speechSegmentsRef.current.length % mockSpeech.length];
    const speaker = speakersRef.current.find(s => s.id === currentSpeakerIdRef.current) || speakersRef.current[0];
    const minutes = Math.floor(durationRef.current / 60).toString().padStart(2, '0');
    const seconds = (durationRef.current % 60).toString().padStart(2, '0');

    setSpeechSegments(prev => [
      ...prev,
      {
        id: Date.now(),
        speakerId: speaker.id,
        time: `${minutes}:${seconds}`,
        original: sample.original,
      },
    ]);
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      if (mediaRecorderRef.current?.state === 'paused') return;
      setDuration(prev => {
        const next = prev + 1;
        durationRef.current = next;
        return next;
      });
    }, 1000);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showNotice('当前浏览器不支持录音，请使用最新版 Chrome 或 Edge');
      return;
    }

    resetAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        createAudioFile();
        webSpeechRecognizer.stop();
        paraformerRecognizer.stop();
      };
      
      mediaRecorderRef.current.start();
      
      if (speechConfig.recognizer === 'web-speech') {
        webSpeechGotResultRef.current = false;
        webSpeechRecognizer.start(speechConfig.language);
        showNotice('录音已开始，正在进行实时转写');

        // 5 秒后检测是否收到识别结果，如果没有则提示
        webSpeechTimeoutRef.current = window.setTimeout(() => {
          webSpeechTimeoutRef.current = null;
          if (!webSpeechGotResultRef.current && recordingState !== 'idle') {
            console.warn('[WebSpeech] 5秒内未收到识别结果，可能不可用');
            setShowWebSpeechWarning(true);
          }
        }, 5000);
      } else if (speechConfig.recognizer === 'paraformer-api' && speechConfig.apiKey) {
        try {
          await paraformerRecognizer.init({
            apiKey: speechConfig.apiKey,
            workspaceId: speechConfig.workspaceId,
          });
          await (paraformerRecognizer as any).startWithStream(stream, speechConfig.language);
          showNotice('录音已开始，正在进行实时转写（Paraformer API）');
        } catch (error) {
          console.error('Paraformer实时识别启动失败:', error);
          showNotice(`Paraformer实时识别启动失败: ${(error as Error).message}`);
        }
      } else {
        showNotice('录音已开始，录音结束后将使用Whisper API进行转写');
      }
      
      setRecordingState('recording');
      startTimer();
    } catch {
      showNotice('无法启动录音，请检查麦克风权限');
    }
  };

  const openAudioUpload = () => {
    audioUploadInputRef.current?.click();
  };

  const addUploadedAudioSegment = (fileName: string) => {
    const speaker = speakers[0];

    setSpeechSegments(prev => [
      ...prev,
      {
        id: Date.now(),
        speakerId: speaker.id,
        time: '上传文件',
        original: `已上传本地录音文件《${fileName}》，可在此补充或修正语音识别后的原始内容。`,
      },
    ]);
  };

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name)) {
      showNotice('请上传音频文件，如 mp3、wav、m4a、aac、ogg 或 webm');
      return;
    }

    resetAudio();
    stopTimer();
    stopTracks();

    setAudioUrl(URL.createObjectURL(file));
    setAudioFileName(file.name);
    setRecordingState('recording');

    // 自动使用Paraformer识别上传的音频文件
    if (speechConfig.recognizer === 'paraformer-api' && speechConfig.apiKey) {
      showNotice('正在使用Paraformer API进行语音识别...');
      try {
        await paraformerRecognizer.init({
          apiKey: speechConfig.apiKey,
          workspaceId: speechConfig.workspaceId,
        });
        paraformerRecognizer.onresult = onTranscriptResult;
        paraformerRecognizer.onerror = (error: Error) => {
          console.error('Paraformer识别错误:', error);
          showNotice(`识别错误: ${error.message}`);
        };
        await (paraformerRecognizer as any).recognizeAudioFile(file, speechConfig.language);
        showNotice('语音识别完成');
      } catch (error) {
        console.error('Paraformer音频文件识别失败:', error);
        showNotice(`语音识别失败: ${(error as Error).message}`);
      }
    } else {
      addUploadedAudioSegment(file.name);
      showNotice('本地语音文件已上传，可直接试听并生成会议纪要');
    }

    setRecordingState('finished');
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (recordingState === 'recording') {
      if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.pause();
      webSpeechRecognizer.stop();
      paraformerRecognizer.stop();
      setRecordingState('paused');
      showNotice('录音已暂停');
      return;
    }

    if (recordingState === 'paused') {
      if (mediaRecorderRef.current.state === 'paused') mediaRecorderRef.current.resume();
      if (speechConfig.recognizer === 'web-speech') {
        webSpeechRecognizer.start(speechConfig.language);
      }
      setRecordingState('recording');
      showNotice('录音已继续');
    }
  };

  /** 从浏览器语音识别切换到 Paraformer 高精度模式（录音中切换） */
  const switchToParaformer = async () => {
    setShowWebSpeechWarning(false);
    webSpeechRecognizer.stop();

    if (!speechConfig.apiKey) {
      // 没有 API Key，打开设置
      setShowSettings(true);
      setSpeechConfig(prev => ({ ...prev, recognizer: 'paraformer-api' }));
      showNotice('请先配置阿里云 API Key，然后重新开始录音');
      return;
    }

    // 有 Key，直接切换
    setSpeechConfig(prev => ({ ...prev, recognizer: 'paraformer-api' }));

    try {
      await paraformerRecognizer.init({
        apiKey: speechConfig.apiKey,
        workspaceId: speechConfig.workspaceId,
      });
      const stream = mediaStreamRef.current;
      if (stream) {
        await (paraformerRecognizer as any).startWithStream(stream, speechConfig.language);
        showNotice('已切换到高精度模式（Paraformer），继续说话即可');
      }
    } catch (error) {
      console.error('切换 Paraformer 失败:', error);
      showNotice(`切换高精度模式失败: ${(error as Error).message}`);
    }
  };

  /** 自动识别说话人（录音结束后按音色分配角色） */
  const autoDiarizeSpeakers = async () => {
    if (!audioBlobRef.current) {
      showNotice('没有录音文件，无法识别角色');
      return;
    }
    if (!speechConfig.apiKey) {
      showNotice('需要配置阿里云 API Key 才能使用角色识别');
      setShowSettings(true);
      return;
    }

    setIsDiarizing(true);
    showNotice('正在识别说话人角色，请稍候...');

    try {
      const recognizer = new ParaformerFileRecognizer(speechConfig.apiKey);
      const result = await recognizer.recognizeWithDiarization(audioBlobRef.current);

      if (!result.success) {
        showNotice(`角色识别失败: ${result.error || '未知错误'}`);
        setIsDiarizing(false);
        return;
      }

      if (result.speakers.length === 0) {
        showNotice('未能识别出不同的说话人，可能只有一人发言');
        setIsDiarizing(false);
        return;
      }

      // 收集所有唯一的 speaker_id
      const uniqueSpeakerIds = [...new Set(result.speakers.map(s => s.speakerId))];
      console.log(`[Diarization] 识别到 ${uniqueSpeakerIds.length} 位说话人:`, uniqueSpeakerIds);

      // 为每个 speaker_id 分配一个角色
      const speakerIdMap: Record<string, number> = {};
      const colors = speakerColors;
      const newSpeakers = uniqueSpeakerIds.map((sid, index) => {
        speakerIdMap[sid] = index + 1; // 角色ID从1开始
        return {
          id: index + 1,
          name: `说话人${index + 1}`,
          role: '',
          color: colors[index % colors.length],
        };
      });

      // 更新角色列表（保留原有角色作为"主持人"）
      setSpeakers(prev => {
        const host = prev[0]; // 保留第一个角色
        return [host, ...newSpeakers];
      });

      // 将识别结果映射到 speechSegments
      const newSegments = result.speakers.map((s, index) => ({
        id: Date.now() + index,
        speakerId: speakerIdMap[s.speakerId] || 1,
        time: `${Math.floor(s.beginTime / 60000).toString().padStart(2, '0')}:${Math.floor((s.beginTime % 60000) / 1000).toString().padStart(2, '0')}`,
        original: s.text,
      }));

      setSpeechSegments(newSegments);
      showNotice(`角色识别完成！识别到 ${uniqueSpeakerIds.length} 位说话人`);
    } catch (error) {
      console.error('[Diarization] 失败:', error);
      showNotice(`角色识别失败: ${(error as Error).message}`);
    }

    setIsDiarizing(false);
  };

  const stopRecording = () => {
    if (recordingState !== 'recording' && recordingState !== 'paused') return;

    stopTimer();
    setRecordingState('finished');
    webSpeechRecognizer.stop();
    whisperAPIRecognizer.stop();
    paraformerRecognizer.stop();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopTracks();
    }
  };

  const resetRecording = () => {
    if (recordingState === 'recording' || recordingState === 'paused') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    }
    stopTimer();
    stopTracks();
    resetAudio();
    setDuration(0);
    setSpeechSegments([]);
    setRecordingState('idle');
    setCurrentSpeakerId(initialSpeakers[0].id);
    showNotice('页面已重置');
  };

  const updateSpeaker = (id: number, field: keyof Omit<Speaker, 'id'>, value: string) => {
    setSpeakers(prev => prev.map(speaker => speaker.id === id ? { ...speaker, [field]: value } : speaker));
  };

  const addSpeaker = () => {
    setSpeakers(prev => [
      ...prev,
      { id: Date.now(), name: `发言人${prev.length + 1}`, role: '待完善角色' },
    ]);
  };

  const removeSpeaker = (id: number) => {
    setSpeakers(prev => {
      if (prev.length <= 1) return prev;
      const fallbackId = prev.find(item => item.id !== id)?.id;
      if (fallbackId) {
        setSpeechSegments(segments => segments.map(segment => segment.speakerId === id ? { ...segment, speakerId: fallbackId } : segment));
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const updateSegment = (id: number, field: keyof Omit<SpeechSegment, 'id'>, value: string | number) => {
    setSpeechSegments(prev => prev.map(segment => segment.id === id ? { ...segment, [field]: value } : segment));
  };

  const getSegmentsBySpeaker = (speakerId: number) => {
    return speechSegments.filter(segment => segment.speakerId === speakerId);
  };

  const getSpeakerLabel = (speakerId: number) => {
    const speaker = speakers.find(item => item.id === speakerId);
    return speaker ? `${speaker.name}（${speaker.role}）` : '未知角色';
  };

  const saveLLMConfig = () => {
    pluginManager.setConfig('llmConfig', llmConfig);
    showNotice('大模型配置已保存');
    setShowSettings(false);
  };

  const testLLMConnection = async () => {
    if (!llmConfig.apiKey) {
      setTestResult({ status: 'error', message: '请先输入API密钥' });
      return;
    }
    if (!llmConfig.baseUrl) {
      setTestResult({ status: 'error', message: '请先输入API地址' });
      return;
    }
    if (!llmConfig.model) {
      setTestResult({ status: 'error', message: '请先选择或输入模型名称' });
      return;
    }

    setTestResult({ status: 'loading', message: '正在测试大模型连接...' });

    try {
      const adapter = pluginManager.getLLMAdapter(llmConfig.provider);
      if (!adapter) {
        throw new Error('未找到对应的大模型适配器');
      }

      await adapter.init({ apiKey: llmConfig.apiKey, baseUrl: llmConfig.baseUrl, authType: llmConfig.authType, authHeader: llmConfig.authHeader });
      
      const result = await adapter.chat(
        [{ role: 'user', content: '北京天气怎么样？' }],
        llmConfig.model,
        { maxTokens: 50 }
      );

      if (result && result.length > 0) {
        setTestResult({ status: 'success', message: '大模型连接测试成功！', response: result });
      } else {
        setTestResult({ status: 'error', message: '大模型返回空结果，请检查配置是否正确' });
      }
    } catch (error) {
      console.error('大模型连接测试失败:', error);
      setTestResult({ status: 'error', message: `连接测试失败: ${(error as Error).message}` });
    }
  };

  const testSpeechConnection = async () => {
    if (speechConfig.recognizer === 'web-speech') {
      setSpeechTestResult({ status: 'success', message: '浏览器语音识别无需测试，直接使用浏览器原生API' });
      return;
    }
    if (!speechConfig.apiKey) {
      setSpeechTestResult({ status: 'error', message: '请先输入API密钥' });
      return;
    }

    setSpeechTestResult({ status: 'loading', message: '正在测试 Paraformer API 连接...' });

    try {
      if (speechConfig.recognizer === 'paraformer-api') {
        await paraformerRecognizer.init({
          apiKey: speechConfig.apiKey,
          workspaceId: speechConfig.workspaceId,
        });
        const result = await (paraformerRecognizer as any).testConnection();
        if (result.success) {
          setSpeechTestResult({ status: 'success', message: result.message });
        } else {
          setSpeechTestResult({ status: 'error', message: result.message });
        }
      }
    } catch (error) {
      console.error('语音识别API测试失败:', error);
      setSpeechTestResult({ status: 'error', message: `连接测试失败: ${(error as Error).message}` });
    }
  };

  const buildSummary = () => {
    const content = speechSegments
      .map(item => `- ${item.time} ${getSpeakerLabel(item.speakerId)}：${item.original}`)
      .join('\n');
    const tpl = summaryTemplates.find(t => t.id === selectedTemplateId) ?? summaryTemplates[0];
    return tpl.fallback(content);
  };

  const buildTodos = (): TodoItem[] => {
    return [
      { id: Date.now() + 1, title: '补充测试数据和现有系统约束条件', owner: '张工', dueDate: '3天内', priority: '高' },
      { id: Date.now() + 2, title: '整理核心需求、优先级和备选技术方案', owner: '王老师', dueDate: '2天内', priority: '高' },
      { id: Date.now() + 3, title: '评估成本、交付周期和客户验收标准', owner: '李经理', dueDate: '5天内', priority: '中' },
    ];
  };

  const generateSummaryWithLLM = async () => {
    if (!llmConfig.enabled || !llmConfig.apiKey) {
      showNotice('请先在设置中配置大模型API密钥');
      return;
    }

    setIsGeneratingSummary(true);

    try {
      const content = speechSegments
        .map(item => `${getSpeakerLabel(item.speakerId)}：${item.original}`)
        .join('\n');

      const tpl = summaryTemplates.find(t => t.id === selectedTemplateId) ?? summaryTemplates[0];

      const prompt = `你是一个专业的会议纪要助手。请根据以下会议记录，生成一份结构化的会议纪要。

会议记录：
${content}

${tpl.llmPrompt}`;

      const adapter = pluginManager.getLLMAdapter(llmConfig.provider);
      if (!adapter) {
        throw new Error('未找到对应的大模型适配器');
      }

      await adapter.init({ apiKey: llmConfig.apiKey, baseUrl: llmConfig.baseUrl, authType: llmConfig.authType, authHeader: llmConfig.authHeader });
      const result = await adapter.chat(
        [{ role: 'user', content: prompt }],
        llmConfig.model
      );

      setDraftSummary(result);

      const todoPrompt = `请从以下会议纪要中提取待办事项，以JSON数组格式输出，不要包含任何其他文字：

${result}

输出格式（严格遵守，只输出JSON数组）：
[{"title": "待办事项标题", "owner": "负责人", "dueDate": "截止日期", "priority": "高"}]

priority只能是：高、中、低`;

      const todoResult = await adapter.chat(
        [{ role: 'user', content: todoPrompt }],
        llmConfig.model
      );

      try {
        // 从LLM返回的文本中提取JSON数组（可能包含markdown代码块）
        const jsonMatch = todoResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsedTodos = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsedTodos)) {
            setDraftTodos(parsedTodos.map((t: any, i: number) => ({
              id: Date.now() + i,
              title: t.title || '',
              owner: t.owner || '',
              dueDate: t.dueDate || '待定',
              priority: (['高', '中', '低'].includes(t.priority) ? t.priority : '中') as '高' | '中' | '低',
            })));
          }
        } else {
          setDraftTodos(buildTodos());
        }
      } catch (e) {
        console.error('待办事项解析失败:', e, '原始返回:', todoResult);
        setDraftTodos(buildTodos());
      }

      showNotice('会议纪要生成成功');
    } catch (error) {
      console.error('生成会议纪要失败:', error);
      showNotice(`生成会议纪要失败: ${(error as Error).message}`);
      setDraftSummary(buildSummary());
      setDraftTodos(buildTodos());
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const openGenerateDialog = async () => {
    const segments = speechSegmentsRef.current;
    if (segments.length === 0 && !realtimeText.trim()) {
      showNotice('请先录音并生成语音内容');
      return;
    }

    setDraftProjectId(projectOptions[0].id);
    setDraftPhase('discussion');

    if (llmConfig.enabled && llmConfig.apiKey) {
      await generateSummaryWithLLM();
    } else {
      setDraftSummary(buildSummary());
      setDraftTodos(buildTodos());
    }

    setShowDialog(true);
  };

  const addTodo = () => {
    setDraftTodos(prev => [
      ...prev,
      { id: Date.now(), title: '新增待办事项', owner: '', dueDate: '待定', priority: '中' },
    ]);
  };

  const updateTodo = (id: number, field: keyof Omit<TodoItem, 'id'>, value: string) => {
    setDraftTodos(prev => prev.map(todo => todo.id === id ? { ...todo, [field]: value } as TodoItem : todo));
  };

  const removeTodo = (id: number) => {
    setDraftTodos(prev => prev.filter(item => item.id !== id));
  };

  const confirmGenerate = async () => {
    await saveMeetingRecord();
    setShowDialog(false);
    showNotice('会议纪要与待办已生成，并完成项目关联');
  };

  return (
    <div className="p-6 space-y-6">
      {notice && (
        <div className="fixed right-6 top-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {notice}
        </div>
      )}

      <section className="rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-800 p-8 text-white shadow-lg">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-blue-100">
              <FileAudio className="h-4 w-4" />
              录音即纪要 · 智能会议工作台
            </div>
            <h1 className="mb-3 text-3xl font-bold">录音、实时转写、纪要待办，一页完成</h1>
            <p className="max-w-3xl text-sm leading-6 text-blue-100">
              面向项目周会、技术评审、客户沟通等场景，支持录音控制、实时转写、按角色整理发言，并在录制后一键生成会议纪要与待办事项。
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                <History className="h-4 w-4" />
                历史记录 ({meetingHistory.length})
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                <Settings className="h-4 w-4" />
                设置
              </button>
              <button
                onClick={() => { localStorage.removeItem('meeting-recorder-onboarded'); setShowOnboarding(true); }}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
                title="重新查看使用引导"
              >
                <Zap className="h-4 w-4" />
                引导
              </button>
            </div>
            <div className="grid min-w-[260px] grid-cols-3 gap-3 rounded-2xl bg-white/10 p-3">
              <div className="rounded-xl bg-white/10 p-3 text-center">
                <p className="text-xs text-blue-100">录音时长</p>
                <p className="text-xl font-bold">{formattedDuration}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3 text-center">
                <p className="text-xs text-blue-100">翻译段落</p>
                <p className="text-xl font-bold">{speechSegments.length}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3 text-center">
                <p className="text-xs text-blue-100">参与角色</p>
                <p className="text-xl font-bold">{speakers.length}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${statusDotClass[recordingState]}`} />
              <h2 className="font-bold text-gray-800">会议录音操作区</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass[recordingState]}`}>{statusText[recordingState]}</span>
            </div>
            <p className="text-sm text-gray-500">顶部只放录音相关操作，用户按从左到右的顺序即可完成录制。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={audioUploadInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
              className="hidden"
              onChange={handleAudioUpload}
            />
            <button
              onClick={startRecording}
              disabled={recordingState !== 'idle' && recordingState !== 'finished'}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Mic className="h-4 w-4" />
              开始录音
            </button>
            <button
              onClick={openAudioUpload}
              disabled={recordingState === 'recording' || recordingState === 'paused'}
              className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Upload className="h-4 w-4" />
              上传语音
            </button>
            <button
              onClick={togglePause}
              disabled={recordingState !== 'recording' && recordingState !== 'paused'}
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Pause className="h-4 w-4" />
              {recordingState === 'paused' ? '继续录音' : '暂停录音'}
            </button>
            <button
              onClick={stopRecording}
              disabled={recordingState !== 'recording' && recordingState !== 'paused'}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Square className="h-4 w-4" />
              终止录音
            </button>
            <button
              onClick={resetRecording}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              重置
            </button>
            <button
              onClick={appendMockSpeech}
              disabled={recordingState !== 'recording'}
              className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Languages className="h-4 w-4" />
              模拟语音
            </button>
          </div>
        </div>

        {audioUrl && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <p className="font-medium text-emerald-900">已生成语音文件：{audioFileName}</p>
                <p className="mt-1 text-sm text-emerald-700">录音终止后自动生成，可试听后再生成会议纪要。</p>
                {speechConfig.apiKey && (
                  <button
                    onClick={autoDiarizeSpeakers}
                    disabled={isDiarizing}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isDiarizing ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        正在识别说话人...
                      </>
                    ) : (
                      <>
                        <UserRound className="h-4 w-4" />
                        自动识别角色（按音色区分）
                      </>
                    )}
                  </button>
                )}
              </div>
              <audio src={audioUrl} controls className="w-full lg:w-96" />
            </div>
          </div>
        )}
      </section>

      {/* 浏览器语音识别不工作时的警告横幅 */}
      {showWebSpeechWarning && recordingState === 'recording' && (
        <div className="mx-0 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-medium text-amber-900">浏览器语音识别未响应</p>
              <p className="mt-1 text-sm text-amber-700">
                浏览器语音识别依赖 Google 服务，在中国大陆网络环境下通常无法使用。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={switchToParaformer}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <Shield className="h-3.5 w-3.5" />
                  切换到高精度模式（推荐）
                </button>
                <a
                  href="https://www.microsoft.com/edge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  尝试 Edge 浏览器
                </a>
                <button
                  onClick={() => setShowWebSpeechWarning(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
                >
                  忽略，继续录音
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="card">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800">语音实时转写</h2>
              <p className="mt-1 text-sm text-gray-500">连贯展示语音识别内容，不做角色区分。</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              recordingState === 'recording'
                ? 'bg-green-50 text-green-700'
                : recordingState === 'paused'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
            }`}>
              {recordingState === 'recording' ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  识别中
                </span>
              ) : recordingState === 'paused' ? '已暂停' : '等待语音'}
            </span>
          </div>
          <div className="h-[520px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-4">
            {!realtimeText.trim() ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                <Languages className="mb-4 h-14 w-14" />
                <p className="text-base font-medium text-slate-500">暂无转写内容</p>
                <p className="mt-2 text-sm">点击"开始录音"后对着麦克风说话，文字会实时显示在这里。</p>
                {speechConfig.recognizer === 'web-speech' && (
                  <div className="mt-4 max-w-xs rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                    <p className="font-medium mb-1">语音识别不工作？</p>
                    <ol className="space-y-0.5 text-left text-amber-600">
                      <li>1. 确认使用 Chrome 或 Edge 浏览器</li>
                      <li>2. 检查浏览器是否允许了麦克风权限</li>
                      <li>3. 确认网络连接正常</li>
                      <li>4. 刷新页面重试</li>
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {realtimeText}
                {recordingState === 'recording' && <span className="animate-pulse text-blue-500">|</span>}
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800">按角色展示录音内容</h2>
              <p className="mt-1 text-sm text-gray-500">右侧用于完善角色信息、修改发言归属和修正原始录音文本。</p>
            </div>
            <button
              onClick={addSpeaker}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              添加角色
            </button>
          </div>

          <div className="h-[520px] space-y-4 overflow-y-auto pr-1">
            {speakers.map((speaker) => (
              <div key={speaker.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                  <label className="text-xs text-slate-500">
                    人员姓名
                    <input
                      className="input-field mt-1 bg-white"
                      value={speaker.name}
                      onChange={(event) => updateSpeaker(speaker.id, 'name', event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    交流角色
                    <input
                      className="input-field mt-1 bg-white"
                      value={speaker.role}
                      onChange={(event) => updateSpeaker(speaker.id, 'role', event.target.value)}
                    />
                  </label>
                  <button
                    onClick={() => removeSpeaker(speaker.id)}
                    disabled={speakers.length <= 1}
                    className="mt-5 inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-400 hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {getSegmentsBySpeaker(speaker.id).length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">
                      暂无该角色录音内容
                    </div>
                  )}
                  {getSegmentsBySpeaker(speaker.id).map(segment => (
                    <div key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="inline-flex items-center text-xs text-slate-400">
                          <Clock className="mr-1 h-3 w-3" />
                          {segment.time}
                        </span>
                        <select
                          value={segment.speakerId}
                          onChange={(event) => updateSegment(segment.id, 'speakerId', Number(event.target.value))}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {speakers.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name} - {item.role}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        value={segment.original}
                        onChange={(event) => updateSegment(segment.id, 'original', event.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="sticky bottom-0 z-20 rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-lg backdrop-blur">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 whitespace-nowrap">纪要模板</span>
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {summaryTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>{tpl.icon} {tpl.name}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </div>
            <span className="hidden text-xs text-slate-400 md:inline">
              {summaryTemplates.find(t => t.id === selectedTemplateId)?.description}
            </span>
          </div>
          <button
            onClick={openGenerateDialog}
            disabled={speechSegments.length === 0 && !realtimeText.trim()}
            className="inline-flex min-w-72 items-center justify-center rounded-2xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            生成会议纪要与待办
          </button>
        </div>
      </section>

      <section className="card">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">功能清单</h2>
            <p className="text-sm text-gray-500">覆盖上传、录音、会议纪要、待办生成和来源追溯等能力。</p>
          </div>
          <button onClick={openGenerateDialog} className="btn-primary">生成会议纪要与待办</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pluginFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{feature.id}</p>
                      <h3 className="font-bold text-gray-800">{feature.name}</h3>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-bold ${priorityStyle[feature.priority]}`}>
                    {feature.priority}
                  </span>
                </div>
                <p className="text-sm leading-6 text-gray-500">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShowDialog(false)}>
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">确认会议纪要与待办</h3>
                <p className="mt-1 text-sm text-slate-500">生成后可关联到指定任务，方便后续跟进。</p>
              </div>
              <button onClick={() => setShowDialog(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </header>

            <main className="space-y-5 overflow-y-auto px-6 py-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">关联项目</span>
                <select value={draftProjectId} onChange={(event) => setDraftProjectId(Number(event.target.value))} className="input-field">
                  {projectOptions.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">当前阶段</span>
                <select value={draftPhase} onChange={(event) => setDraftPhase(event.target.value)} className="input-field">
                  {phaseOptions.map(phase => (
                    <option key={phase.value} value={phase.value}>{phase.label}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">会议纪要</span>
                <textarea value={draftSummary} onChange={(event) => setDraftSummary(event.target.value)} rows={10} className="input-field resize-none leading-6" />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">待办事项</span>
                  <button onClick={addTodo} className="inline-flex items-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
                    <Plus className="mr-1 h-4 w-4" />
                    添加待办
                  </button>
                </div>

                <div className="space-y-3">
                  {draftTodos.map(todo => (
                    <div key={todo.id} className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 lg:grid-cols-[1fr_140px_140px_100px_44px]">
                      <input value={todo.title} onChange={(event) => updateTodo(todo.id, 'title', event.target.value)} className="input-field" placeholder="待办内容" />
                      <input value={todo.owner} onChange={(event) => updateTodo(todo.id, 'owner', event.target.value)} className="input-field" placeholder="负责人" />
                      <input value={todo.dueDate} onChange={(event) => updateTodo(todo.id, 'dueDate', event.target.value)} className="input-field" placeholder="截止时间" />
                      <select value={todo.priority} onChange={(event) => updateTodo(todo.id, 'priority', event.target.value)} className="input-field">
                        <option value="高">高</option>
                        <option value="中">中</option>
                        <option value="低">低</option>
                      </select>
                      <button onClick={() => removeTodo(todo.id)} className="flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </main>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">导出</span>
                <button
                  onClick={async () => { try { await copyAsMarkdown(buildDraftRecord()); showNotice('已复制为 Markdown'); } catch { showNotice('复制失败，请检查浏览器权限'); } }}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> 复制 MD
                </button>
                <button
                  onClick={async () => { try { await exportAsWord(buildDraftRecord()); showNotice('Word 文件已下载'); } catch { showNotice('导出 Word 失败'); } }}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <FileDown className="mr-1 h-3.5 w-3.5" /> Word
                </button>
                <button
                  onClick={() => exportAsPDF(buildDraftRecord())}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <FileOutput className="mr-1 h-3.5 w-3.5" /> PDF
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowDialog(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700 hover:bg-slate-50">取消</button>
                <button onClick={confirmGenerate} className="rounded-xl bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700">确认生成</button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShowHistory(false)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">历史会议记录</h3>
                <p className="mt-1 text-sm text-slate-500">查看和管理本地保存的会议记录</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </header>

            <main className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索会议标题或内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <label className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 cursor-pointer hover:bg-blue-100">
                  <Upload className="h-4 w-4" />
                  导入记录
                  <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importMeetingRecord(e.target.files[0])} />
                </label>
              </div>

              {meetingHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <FolderOpen className="mb-4 h-12 w-12" />
                  <p className="text-base font-medium text-slate-500">暂无历史记录</p>
                  <p className="mt-2 text-sm">完成一次会议录音并生成纪要后，记录会自动保存到这里</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(searchQuery
                    ? meetingHistory.filter(r => 
                        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        r.segments.some(s => s.original.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                    : meetingHistory
                  ).map(record => (
                    <div key={record.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 hover:border-blue-200">
                      <div className="flex-1 cursor-pointer" onClick={() => {
                        setSelectedRecord(record);
                        setShowRecordDetail(true);
                      }}>
                        <p className="font-medium text-slate-900">{record.title}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                            {new Date(record.createdAt).toLocaleString()}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                            {record.segments.length} 段语音
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                            {record.todos.length} 个待办
                          </span>
                          {record.projectId && (
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-600">
                              {projectOptions.find(p => p.id.toString() === record.projectId)?.name || '未关联项目'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => exportMeetingRecord(record)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-500"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteMeetingRecord(record.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {showRecordDetail && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShowRecordDetail(false)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{selectedRecord.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{new Date(selectedRecord.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setShowRecordDetail(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </header>

            <main className="space-y-6 overflow-y-auto px-6 py-5">
              <section>
                <h4 className="mb-4 font-medium text-slate-700">语音转写内容</h4>
                <div className="space-y-4">
                  {selectedRecord.segments.map(segment => (
                    <div key={segment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: segment.speakerColor || '#3b82f6' }}
                        />
                        <span className="text-sm font-medium text-slate-600">
                          {segment.speakerName}（{segment.speakerRole}）
                        </span>
                        <span className="text-xs text-slate-400">{segment.time}</span>
                      </div>
                      <p className="text-sm leading-6 text-slate-800">{segment.original}</p>
                    </div>
                  ))}
                </div>
              </section>

              {selectedRecord.summary && (
                <section>
                  <h4 className="mb-4 font-medium text-slate-700">会议纪要</h4>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {selectedRecord.summary}
                  </div>
                </section>
              )}

              {selectedRecord.todos.length > 0 && (
                <section>
                  <h4 className="mb-4 font-medium text-slate-700">待办事项</h4>
                  <div className="space-y-3">
                    {selectedRecord.todos.map(todo => (
                      <div key={todo.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                        <CheckCircle className={`h-5 w-5 ${todo.status === '已完成' ? 'text-emerald-500' : 'text-slate-300'}`} />
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{todo.title}</p>
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                            <span>负责人：{todo.owner}</span>
                            <span>截止：{todo.dueDate}</span>
                            <span className={`rounded-full px-2 py-0.5 ${
                              todo.priority === '高' ? 'bg-red-50 text-red-600' :
                              todo.priority === '中' ? 'bg-amber-50 text-amber-600' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {todo.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </main>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">导出</span>
                <button
                  onClick={async () => { try { await copyAsMarkdown(selectedRecord); showNotice('已复制为 Markdown'); } catch { showNotice('复制失败'); } }}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> 复制 MD
                </button>
                <button
                  onClick={async () => { try { await exportAsWord(selectedRecord); showNotice('Word 文件已下载'); } catch { showNotice('导出 Word 失败'); } }}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <FileDown className="mr-1 h-3.5 w-3.5" /> Word
                </button>
                <button
                  onClick={() => exportAsPDF(selectedRecord)}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <FileOutput className="mr-1 h-3.5 w-3.5" /> PDF
                </button>
                <button onClick={() => exportMeetingRecord(selectedRecord)} className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  <Download className="mr-1 h-3.5 w-3.5" /> JSON
                </button>
              </div>
              <button onClick={() => setShowRecordDetail(false)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                关闭
              </button>
            </footer>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShowSettings(false)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">设置</h3>
                <p className="mt-1 text-sm text-slate-500">配置大模型API和其他选项</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </header>

            <main className="space-y-5 overflow-y-auto px-6 py-5">
              <section>
                <h4 className="mb-3 font-medium text-slate-700">大模型配置</h4>
                
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">模型提供商</span>
                  <select
                    value={llmConfig.provider}
                    onChange={(e) => {
                      const provider = llmProviderOptions.find(p => p.value === e.target.value);
                      setLlmConfig(prev => ({
                        ...prev,
                        provider: e.target.value as 'openai' | 'baidu' | 'aliyun' | 'custom',
                        model: provider?.models[0] || prev.model,
                        baseUrl: provider?.baseUrl || prev.baseUrl,
                      }));
                    }}
                    className="input-field"
                  >
                    {llmProviderOptions.map(provider => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">模型选择</span>
                  {llmConfig.provider === 'custom' ? (
                    <input
                      type="text"
                      value={llmConfig.model}
                      onChange={(e) => setLlmConfig(prev => ({ ...prev, model: e.target.value }))}
                      placeholder="请输入模型名称，如: gpt-3.5-turbo"
                      className="input-field font-mono text-sm"
                    />
                  ) : (
                    <select
                      value={llmConfig.model}
                      onChange={(e) => setLlmConfig(prev => ({ ...prev, model: e.target.value }))}
                      className="input-field"
                    >
                      {llmProviderOptions
                        .find(p => p.value === llmConfig.provider)
                        ?.models.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                    </select>
                  )}
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">API地址</span>
                  <input
                    type="text"
                    value={llmConfig.baseUrl}
                    onChange={(e) => setLlmConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder={llmConfig.provider === 'custom' ? '请输入API基础地址，如: https://api.example.com/v1' : '默认使用官方API地址'}
                    className="input-field font-mono text-sm"
                  />
                  {llmConfig.provider !== 'custom' && (
                    <p className="text-xs text-slate-400">留空则使用默认地址，如需使用代理请填写自定义地址</p>
                  )}
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">API密钥</span>
                  <input
                    type="password"
                    value={llmConfig.apiKey}
                    onChange={(e) => setLlmConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="请输入API密钥"
                    className="input-field font-mono text-sm"
                  />
                  {llmConfig.provider === 'baidu' && (
                    <p className="text-xs text-slate-400">百度文心一言请输入：API Key|Secret Key（用竖线分隔）</p>
                  )}
                </label>

                {llmConfig.provider === 'custom' && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">认证方式</span>
                    <select
                      value={llmConfig.authType}
                      onChange={(e) => setLlmConfig(prev => ({ ...prev, authType: e.target.value as 'bearer' | 'api-key-header' | 'custom-header' }))}
                      className="input-field"
                    >
                      <option value="bearer">Bearer Token (Authorization: Bearer xxx)</option>
                      <option value="api-key-header">API Key Header (x-api-key: xxx)</option>
                      <option value="custom-header">自定义Header</option>
                    </select>
                    {llmConfig.authType === 'custom-header' && (
                      <input
                        type="text"
                        value={llmConfig.authHeader}
                        onChange={(e) => setLlmConfig(prev => ({ ...prev, authHeader: e.target.value }))}
                        placeholder="请输入自定义Header名称，如: Authorization"
                        className="input-field font-mono text-sm"
                      />
                    )}
                  </label>
                )}

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={llmConfig.enabled}
                    onChange={(e) => setLlmConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-slate-700">启用大模型（用于生成会议纪要和待办事项）</span>
                </label>

                {!llmConfig.enabled && (
                  <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                    提示：未启用大模型时，会议纪要和待办事项将使用模板生成
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-3 font-medium text-slate-700">语音识别配置</h4>
                
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">语音识别器</span>
                  <select
                    value={speechConfig.recognizer}
                    onChange={(e) => setSpeechConfig(prev => ({ ...prev, recognizer: e.target.value as 'web-speech' | 'paraformer-api' }))}
                    className="input-field"
                  >
                    <option value="web-speech">浏览器语音识别（免费，实时）</option>
                    <option value="paraformer-api">Paraformer API（阿里云，高精度）</option>
                  </select>
                </label>

                {speechConfig.recognizer === 'paraformer-api' && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">API密钥</span>
                    <input
                      type="password"
                      value={speechConfig.apiKey}
                      onChange={(e) => setSpeechConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder={speechConfig.recognizer === 'paraformer-api' ? '请输入阿里云DashScope API密钥' : '请输入OpenAI API密钥'}
                      className="input-field font-mono text-sm"
                    />
                  </label>
                )}

                {speechConfig.recognizer === 'paraformer-api' && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">API地址</span>
                    <input
                      type="text"
                      value={speechConfig.baseUrl}
                      onChange={(e) => setSpeechConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="留空则使用默认地址"
                      className="input-field font-mono text-sm"
                    />
                  </label>
                )}

                {speechConfig.recognizer === 'paraformer-api' && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Workspace ID（可选）</span>
                    <input
                      type="text"
                      value={speechConfig.workspaceId}
                      onChange={(e) => setSpeechConfig(prev => ({ ...prev, workspaceId: e.target.value }))}
                      placeholder="留空则使用默认域名，建议填写以获得更好性能"
                      className="input-field font-mono text-sm"
                    />
                  </label>
                )}

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">识别语言</span>
                  <select
                    value={speechConfig.language}
                    onChange={(e) => setSpeechConfig(prev => ({ ...prev, language: e.target.value }))}
                    className="input-field"
                  >
                    <option value="zh-CN">中文（普通话）</option>
                    <option value="en-US">英语</option>
                    <option value="ja-JP">日语</option>
                    <option value="ko-KR">韩语</option>
                    <option value="zh-TW">中文（繁体）</option>
                    <option value="zh-HK">中文（香港）</option>
                  </select>
                </label>

                <div className="mt-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
                  <p className="font-medium mb-1">语音识别说明：</p>
                  <ul className="space-y-1">
                    <li>• 浏览器语音识别：使用浏览器原生Web Speech API，免费，支持实时转写，但准确性可能有限</li>
                    <li>• Paraformer API：阿里云高精度语音识别模型，中文识别准确率高，需要API密钥，支持实时转写</li>
                  </ul>
                </div>

                <button
                  onClick={testSpeechConnection}
                  className="mt-4 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  测试语音识别连接
                </button>

                {speechTestResult && (
                  <section className={`mt-4 rounded-xl p-3 ${
                    speechTestResult.status === 'loading' ? 'bg-blue-50' :
                    speechTestResult.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      {speechTestResult.status === 'loading' && (
                        <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {speechTestResult.status === 'success' && (
                        <svg className="h-4 w-4 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                        </svg>
                      )}
                      {speechTestResult.status === 'error' && (
                        <svg className="h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path>
                        </svg>
                      )}
                      <span className={`text-xs font-medium ${
                        speechTestResult.status === 'loading' ? 'text-blue-800' :
                        speechTestResult.status === 'success' ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {speechTestResult.message}
                      </span>
                    </div>
                  </section>
                )}
              </section>

              <section className="rounded-xl bg-blue-50 p-4">
                <h4 className="mb-2 font-medium text-blue-800">API密钥获取指南</h4>
                <ul className="space-y-2 text-xs text-blue-700">
                  <li>• OpenAI: 访问 https://platform.openai.com/ 注册并创建API Key</li>
                  <li>• 百度文心一言: 访问 https://console.bce.baidu.com/ 创建千帆大模型应用</li>
                  <li>• 阿里通义千问: 访问 https://dashscope.aliyun.com/ 创建API Key</li>
                  <li>• 自定义大模型: 支持任何兼容OpenAI格式的API，如国产大模型、企业私有化部署模型等</li>
                </ul>
              </section>

              {testResult && (
                <section className={`rounded-xl p-4 ${
                  testResult.status === 'loading' ? 'bg-blue-50' :
                  testResult.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.status === 'loading' && (
                      <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {testResult.status === 'success' && (
                      <svg className="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                      </svg>
                    )}
                    {testResult.status === 'error' && (
                      <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path>
                      </svg>
                    )}
                    <span className={`font-medium ${
                      testResult.status === 'loading' ? 'text-blue-800' :
                      testResult.status === 'success' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {testResult.message}
                    </span>
                  </div>
                  {testResult.response && (
                    <div className="mt-3 rounded-lg bg-white p-3 border border-green-200">
                      <p className="text-xs text-green-600 mb-1">大模型响应：</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{testResult.response}</p>
                    </div>
                  )}
                </section>
              )}
            </main>

            <footer className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setShowSettings(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700 hover:bg-slate-50">取消</button>
              <button onClick={testLLMConnection} className="rounded-xl border border-green-200 bg-green-50 px-5 py-2.5 text-green-700 hover:bg-green-100">测试连接</button>
              <button onClick={saveLLMConfig} className="rounded-xl bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700">保存设置</button>
            </footer>
          </div>
        </div>
      )}

      {isGeneratingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60">
          <div className="flex flex-col items-center rounded-2xl bg-white p-6">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="mt-4 text-lg font-medium text-slate-700">正在生成会议纪要...</p>
            <p className="mt-2 text-sm text-slate-500">请稍候，大模型正在处理您的会议内容</p>
          </div>
        </div>
      )}

      {showOnboarding && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </div>
  );
}
