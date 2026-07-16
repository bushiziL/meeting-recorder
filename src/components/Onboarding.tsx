import { useState } from 'react';
import {
  Mic,
  Sparkles,
  ArrowRight,
  CheckCircle,
  X,
  Zap,
  Shield,
  Globe,
  Key,
} from 'lucide-react';

interface OnboardingProps {
  onComplete: (mode: 'free' | 'pro') => void;
  onSkip: () => void;
}

const STEPS_FREE = [
  { icon: Mic, title: '点击录音按钮', desc: '打开页面后直接点击录音，浏览器会请求麦克风权限' },
  { icon: Globe, title: '实时转写', desc: '说话的内容会实时显示在屏幕上，支持中英文' },
  { icon: Sparkles, title: '生成纪要', desc: '录音结束后一键生成会议纪要和待办事项' },
];

const STEPS_PRO = [
  {
    step: 1,
    title: '注册阿里云账号',
    desc: '访问 dashscope.console.aliyun.com，注册/登录阿里云账号',
    link: 'https://bailian.console.aliyun.com/',
    linkText: '打开百炼控制台 →',
  },
  {
    step: 2,
    title: '创建 API Key',
    desc: '在左侧菜单「API-KEY 管理」中点击「创建 API Key」，复制生成的 sk- 开头的密钥',
  },
  {
    step: 3,
    title: '填入 Key 开始使用',
    desc: '回到本系统，在设置页面的「语音识别配置」中粘贴 API Key 即可',
  },
];

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [mode, setMode] = useState<'choose' | 'free' | 'pro'>('choose');

  if (mode === 'choose') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4">
        <button
          onClick={onSkip}
          className="absolute right-6 top-6 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/70"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="w-full max-w-2xl">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-blue-200 backdrop-blur">
              🎙️ 首次使用引导
            </div>
            <h1 className="mb-3 text-3xl font-bold text-white">
              选择你的使用方式
            </h1>
            <p className="mx-auto max-w-md text-blue-200/80">
              两种模式随时可以切换，不影响已保存的数据
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* 免费体验 */}
            <button
              onClick={() => setMode('free')}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur transition-all hover:border-emerald-400/40 hover:bg-white/10"
            >
              <div className="mb-4 inline-flex rounded-2xl bg-emerald-500/20 p-3">
                <Zap className="h-6 w-6 text-emerald-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-white">免费体验</h2>
              <p className="mb-4 text-sm leading-6 text-blue-200/70">
                用浏览器自带语音识别，零配置即开即用。适合快速体验和日常短会。
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5" /> 零配置，开箱即用
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5" /> 完全免费
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5" /> 实时转写
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span className="h-3.5 w-3.5 flex items-center justify-center text-[10px]">⚠</span> 需 Chrome/Edge 浏览器
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-400 group-hover:gap-2 transition-all">
                开始使用 <ArrowRight className="h-4 w-4" />
              </div>
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/5" />
            </button>

            {/* 高精度模式 */}
            <button
              onClick={() => setMode('pro')}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur transition-all hover:border-amber-400/40 hover:bg-white/10"
            >
              <div className="mb-4 inline-flex rounded-2xl bg-amber-500/20 p-3">
                <Shield className="h-6 w-6 text-amber-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-white">高精度模式</h2>
              <p className="mb-4 text-sm leading-6 text-blue-200/70">
                接入阿里云 Paraformer 语音识别 + 大模型，中文识别更准，纪要质量更高。
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <CheckCircle className="h-3.5 w-3.5" /> 中文识别准确率 &gt;95%
                </div>
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <CheckCircle className="h-3.5 w-3.5" /> AI 纪要质量更高
                </div>
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <CheckCircle className="h-3.5 w-3.5" /> 需要阿里云 API Key
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-400 group-hover:gap-2 transition-all">
                3 步配置 <ArrowRight className="h-4 w-4" />
              </div>
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'free') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4">
        <button
          onClick={onSkip}
          className="absolute right-6 top-6 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/70"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex rounded-2xl bg-emerald-500/20 p-3">
              <Zap className="h-8 w-8 text-emerald-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">免费体验 · 3 步上手</h1>
            <p className="text-sm text-blue-200/70">使用浏览器自带语音识别，零配置</p>
          </div>

          <div className="space-y-4">
            {STEPS_FREE.map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-lg font-bold text-emerald-400">
                  {i + 1}
                </div>
                <div>
                  <h3 className="mb-1 font-semibold text-white">{step.title}</h3>
                  <p className="text-sm leading-6 text-blue-200/70">{step.desc}</p>
                </div>
                <step.icon className="mt-1 h-5 w-5 shrink-0 text-emerald-400/50" />
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-amber-300/80">
              ⚠️ 浏览器语音识别需要 Chrome 或 Edge 浏览器，且需要网络连接（音频在云端处理）。
              如果说话后没有文字出现：1）检查浏览器是否允许了麦克风权限；2）确认网络正常；
              3）尝试刷新页面。如果仍有问题，建议切换到高精度模式。
            </p>
          </div>

          <button
            onClick={() => onComplete('free')}
            className="mt-6 w-full rounded-2xl bg-emerald-500 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600"
          >
            开始录音 🎙️
          </button>
        </div>
      </div>
    );
  }

  // pro mode
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4">
      <button
        onClick={onSkip}
        className="absolute right-6 top-6 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/70"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex rounded-2xl bg-amber-500/20 p-3">
            <Shield className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">高精度模式 · 3 步配置</h1>
          <p className="text-sm text-blue-200/70">接入阿里云 Paraformer + 大模型，体验更好</p>
        </div>

        <div className="space-y-4">
          {STEPS_PRO.map((step) => (
            <div
              key={step.step}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-lg font-bold text-amber-400">
                  {step.step}
                </div>
                <div className="flex-1">
                  <h3 className="mb-1 font-semibold text-white">{step.title}</h3>
                  <p className="text-sm leading-6 text-blue-200/70">{step.desc}</p>
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300"
                    >
                      <Key className="h-3.5 w-3.5" />
                      {step.linkText}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-xs text-blue-300/80">
            💡 阿里云 DashScope 新用户有免费额度，语音识别和通义千问大模型都可以免费试用。API Key 配好后，在设置中还能配置大模型（用于生成会议纪要）。
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setMode('choose')}
            className="flex-1 rounded-2xl border border-white/10 py-4 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
          >
            返回选择
          </button>
          <button
            onClick={() => onComplete('pro')}
            className="flex-1 rounded-2xl bg-amber-500 py-4 text-base font-semibold text-white shadow-lg shadow-amber-500/25 hover:bg-amber-600"
          >
            我已准备好，开始使用 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
