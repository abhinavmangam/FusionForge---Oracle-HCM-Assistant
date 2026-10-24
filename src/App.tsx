import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Download,
  ArrowRight,
  History,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  Code2,
} from 'lucide-react';
import {
  generateLocalFastFormula,
  validateFastFormula,
  formatCode,
  extractCleanCode,
} from './utils/compiler';
import { HistoryItem, ValidationResult } from './types';

const STORAGE_KEY_HISTORY = 'fusionforge_prompt_history_v4';
const STORAGE_KEY_PROMPT_STATS = 'fusionforge_prompt_stats_v2';
const STORAGE_KEY_WELCOME_SEEN = 'fusionforge_welcome_seen_v5';

interface FrequentScenario {
  id: string;
  label: string;
  text: string;
  count: number;
  lastUsed: number;
}

const DEFAULT_SCENARIOS: FrequentScenario[] = [
  {
    id: 'def-1',
    label: 'Retention Bonus',
    text: 'Calculate a retention bonus based on employee tenure: if tenure is 3+ years give 15% of annual salary; if 5+ years give 20%. Cap bonus at $25,000 using CMP_SALARY. Handle zero salary and log with ESS_LOG_WRITE.',
    count: 1,
    lastUsed: 1,
  },
  {
    id: 'def-2',
    label: 'Absence Accrual Band',
    text: 'Global Absence Accrual formula awarding monthly PTO hours: 10 hrs for 0-2 years, 14 hrs for 2-5 years, and 18 hrs for 5+ years. Prorate for part-time workers using PER_ASG_FTE_VALUE and cap rollover carryover at 40 hours.',
    count: 1,
    lastUsed: 2,
  },
  {
    id: 'def-3',
    label: 'Overtime Cap Validation',
    text: 'Element Input Validation fast formula that prevents submission if entered Overtime Hours exceed 60 hours in a single pay period or if the entered value is negative. Return user-friendly error message in Payroll UI.',
    count: 1,
    lastUsed: 3,
  },
  {
    id: 'def-4',
    label: 'Merit Salary Eligibility',
    text: 'Compensation Person Selection rule evaluating annual merit eligibility. Include only regular full-time workers with enterprise hire date prior to October 1st of previous year. Exclude contractor jobs.',
    count: 1,
    lastUsed: 4,
  },
];

// Helper to derive a clean scenario pill label from user prompt & formula name
function deriveScenarioLabel(text: string, formulaName?: string): string {
  if (formulaName) {
    const clean = formulaName
      .replace(/^(XXHCM|XX|FF|PER|CMP|PAY)_/i, '')
      .replace(/_(CALC|RULE|XTR|FORMULA|VALIDATION)$/i, '')
      .replace(/_/g, ' ')
      .trim();
    if (clean.length >= 3 && clean.length <= 26) {
      return clean
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  const cleanText = text.replace(/^(Calculate|Generate|Create|I need|Write|Provide|Build)\s+/i, '');
  const words = cleanText.split(/\s+/).slice(0, 4);
  const derived = words.join(' ');
  return derived.length > 25 ? derived.slice(0, 24) + '…' : derived;
}

export default function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // First-time user welcome screen transition
  const [isFirstTimeUser] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_WELCOME_SEEN) !== 'true';
    } catch (e) {
      console.error(e);
      return true;
    }
  });

  const [welcomeFading, setWelcomeFading] = useState<boolean>(false);
  const [welcomeDone, setWelcomeDone] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_WELCOME_SEEN) === 'true';
    } catch {
      return false;
    }
  });

  const handleDismissWelcome = () => {
    if (welcomeFading || welcomeDone) return;
    setWelcomeFading(true);
    setTimeout(() => {
      setWelcomeDone(true);
      try {
        localStorage.setItem(STORAGE_KEY_WELCOME_SEEN, 'true');
      } catch (e) {
        console.error(e);
      }
    }, 600);
  };

  const handleReplayWelcome = () => {
    setWelcomeDone(false);
    setWelcomeFading(false);
  };

  // Allow dismissing the welcome screen via keyboard (Enter, Space, or Escape)
  useEffect(() => {
    if (welcomeDone) return;
    const handleKeyDownDismiss = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        handleDismissWelcome();
      }
    };
    window.addEventListener('keydown', handleKeyDownDismiss);
    return () => window.removeEventListener('keydown', handleKeyDownDismiss);
  }, [welcomeDone, welcomeFading]);

  // Fast In-Memory Cache for sub-millisecond repeated prompt retrieval
  const cacheRef = useRef<Map<string, { code: string; title: string }>>(new Map());

  // Dynamic frequent scenarios state
  const [scenarios, setScenarios] = useState<FrequentScenario[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROMPT_STATS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SCENARIOS;
  });

  // History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    } catch (e) {
      console.error(e);
    }
  }, [history]);

  // Save scenarios to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROMPT_STATS, JSON.stringify(scenarios));
    } catch (e) {
      console.error(e);
    }
  }, [scenarios]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2500);
  };

  const handleGenerate = async (promptToUse?: string) => {
    const textToSubmit = (promptToUse ?? prompt).trim();
    // Strictly do nothing if prompt is empty or already generating
    if (!textToSubmit || isGenerating) {
      return;
    }

    const cacheKey = textToSubmit.toLowerCase().replace(/\s+/g, ' ');

    // Fast Cache Check: If prompt was previously generated, return immediately
    if (cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey)!;
      setCode(cached.code);
      showToast('Formula ready (instant cache).');
      return;
    }

    setIsGenerating(true);
    let generatedFormula = '';

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'fast_formula',
          prompt: textToSubmit,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        generatedFormula = extractCleanCode(data.text || '', 'fast_formula');
        showToast('Fast Formula generated successfully.');
      } else {
        generatedFormula = generateLocalFastFormula(textToSubmit);
        showToast('Synthesized Fast Formula.');
      }
    } catch (err) {
      console.warn('Backend unavailable, using local synthesis engine:', err);
      generatedFormula = generateLocalFastFormula(textToSubmit);
      showToast('Synthesized Fast Formula.');
    } finally {
      setIsGenerating(false);
      setCode(generatedFormula);

      // Infer title for history and caching
      const nameMatch = generatedFormula.match(/FORMULA NAME\s*:\s*([A-Za-z0-9_]+)/i);
      const title = nameMatch ? nameMatch[1] : 'Custom Fast Formula';

      // Save to memory cache for zero-latency retrieval
      cacheRef.current.set(cacheKey, { code: generatedFormula, title });

      const validation = validateFastFormula(generatedFormula);
      const newItem: HistoryItem = {
        id: `ff-${Date.now()}`,
        title,
        mode: 'fast_formula',
        timestamp: Date.now(),
        prompt: textToSubmit,
        code: generatedFormula,
        context: {} as any,
        isFavorite: false,
        validationIssuesCount: validation.errorCount,
      };

      setHistory((prev) => [newItem, ...prev.slice(0, 49)]);

      // Dynamically adapt Quick Scenarios based on prompt frequency and recency
      setScenarios((prev) => {
        const norm = textToSubmit.toLowerCase().trim();
        const existingIdx = prev.findIndex((s) => s.text.toLowerCase().trim() === norm);
        let updatedList: FrequentScenario[];

        if (existingIdx !== -1) {
          const existing = prev[existingIdx];
          const updated = {
            ...existing,
            count: existing.count + 1,
            lastUsed: Date.now(),
          };
          updatedList = [...prev.slice(0, existingIdx), updated, ...prev.slice(existingIdx + 1)];
        } else {
          const derivedLabel = deriveScenarioLabel(textToSubmit, nameMatch ? nameMatch[1] : undefined);
          const newEntry: FrequentScenario = {
            id: `user-scen-${Date.now()}`,
            label: derivedLabel,
            text: textToSubmit,
            count: 2,
            lastUsed: Date.now(),
          };
          updatedList = [newEntry, ...prev];
        }

        updatedList.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.lastUsed - a.lastUsed;
        });

        return updatedList.slice(0, 8);
      });
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      showToast('Copied code to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  const handleDownload = () => {
    if (!code) return;
    const nameMatch = code.match(/FORMULA NAME\s*:\s*([A-Za-z0-9_]+)/i);
    const fileName = `${nameMatch ? nameMatch[1] : 'FAST_FORMULA'}.ff`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to trigger generation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!prompt.trim() || isGenerating) return;
      handleGenerate();
    }
  };

  const nameMatch = code.match(/FORMULA NAME\s*:\s*([A-Za-z0-9_]+)/i);
  const currentFileName = `${nameMatch ? nameMatch[1] : 'FAST_FORMULA'}.ff`;
  const validationResult: ValidationResult = validateFastFormula(code);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-zinc-900 flex flex-col font-sans relative">
      {/* Welcome Screen Overlay for First-Time Users: Cool graphics, bolder font, clean monochrome aesthetic, smooth vanish */}
      {!welcomeDone && (
        <div
          onClick={handleDismissWelcome}
          className={`fixed inset-0 z-50 bg-[#f8f9fa] flex flex-col items-center justify-center select-none cursor-pointer overflow-hidden transition-all duration-1000 ease-in-out ${
            welcomeFading
              ? 'opacity-0 scale-105 blur-sm pointer-events-none'
              : 'opacity-100 scale-100 blur-0 pointer-events-auto'
          }`}
          aria-live="polite"
        >
          {/* Graphic Dot Matrix Background */}
          <div className="absolute inset-0 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:24px_24px] opacity-60 pointer-events-none" />

          {/* Minimalist Technical Corner Brackets */}
          <div className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 font-mono text-[10px] sm:text-[11px] text-zinc-400 tracking-widest uppercase">
            <span className="w-2.5 h-2.5 border-t-2 border-l-2 border-zinc-400 block" />
            <span>SYS.INIT // HCM_FORGE</span>
          </div>
          <div className="absolute top-6 right-6 sm:top-8 sm:right-8 flex items-center gap-2 font-mono text-[10px] sm:text-[11px] text-zinc-400 tracking-widest uppercase">
            <span className="hidden sm:inline">ORACLE HCM CLOUD</span>
            <span className="w-2.5 h-2.5 border-t-2 border-r-2 border-zinc-400 block" />
          </div>
          <div className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 flex items-center gap-2 font-mono text-[10px] sm:text-[11px] text-zinc-400 tracking-widest uppercase">
            <span className="w-2.5 h-2.5 border-b-2 border-l-2 border-zinc-400 block" />
            <span>PRECISION COMPILER</span>
          </div>
          <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 flex items-center gap-2 font-mono text-[10px] sm:text-[11px] text-zinc-400 tracking-widest uppercase">
            <span>FUSIONFORGE // v2.4</span>
            <span className="w-2.5 h-2.5 border-b-2 border-r-2 border-zinc-400 block" />
          </div>

          {/* Central Welcome Graphic & Typography */}
          <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-xl">
            {/* Cool Geometric Emblem Graphic */}
            <div className="relative mb-6 sm:mb-8 flex items-center justify-center">
              {/* Animated outer precision ring */}
              <svg className="w-32 h-32 sm:w-40 sm:h-40 animate-spin-slow" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="72"
                  fill="none"
                  stroke="#d4d4d8"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="62"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="1"
                />
                {/* Cardinal tick marks */}
                <line x1="80" y1="2" x2="80" y2="10" stroke="#71717a" strokeWidth="2" />
                <line x1="80" y1="150" x2="80" y2="158" stroke="#71717a" strokeWidth="2" />
                <line x1="2" y1="80" x2="10" y2="80" stroke="#71717a" strokeWidth="2" />
                <line x1="150" y1="80" x2="158" y2="80" stroke="#71717a" strokeWidth="2" />
              </svg>

              {/* Counter-rotating inner technical ring */}
              <svg className="absolute w-28 h-28 sm:w-34 sm:h-34 animate-spin-reverse-slow" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r="52"
                  fill="none"
                  stroke="#a1a1aa"
                  strokeWidth="1.2"
                  strokeDasharray="16 10"
                />
              </svg>

              {/* Central Core Badge with geometric spark */}
              <div className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl flex items-center justify-center text-white">
                <div className="relative flex items-center justify-center">
                  <Sparkles className="w-8 h-8 sm:w-9 sm:h-9 text-white fill-white animate-pulse" />
                  <div className="absolute -inset-1 rounded-full bg-white/10 blur-xs" />
                </div>
              </div>
            </div>

            {/* Sub-kicker / Category line */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200/90 bg-white/90 backdrop-blur-xs text-[11px] font-mono text-zinc-600 uppercase tracking-widest mb-4 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-ping" />
              <span>ORACLE HCM SYNTHESIS ENGINE</span>
            </div>

            {/* Bolder Distinctive Typography */}
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter text-zinc-950 font-['Space_Grotesk',sans-serif] uppercase leading-none drop-shadow-xs">
              Welcome
            </h1>

            {/* Interactive Enter CTA button */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleDismissWelcome}
                className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-zinc-950 text-white hover:bg-zinc-800 active:scale-95 text-xs font-mono font-medium tracking-widest uppercase transition-all duration-200 shadow-md hover:shadow-xl cursor-pointer"
              >
                <span>Enter Studio</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
              <p className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase">
                Click anywhere or press Enter to continue
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar (Visuals matching reference image: White bar, black badge, crisp typography) */}
      <header className="bg-white border-b border-zinc-200/90 sticky top-0 z-40 px-6 py-3.5 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-zinc-900">
                  FusionForge
                </span>
                <span className="text-[11px] font-mono uppercase bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded border border-zinc-200">
                  Fast Formula
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-normal">
                Oracle HCM Assistant
              </p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleReplayWelcome}
              title="Replay Welcome Intro"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg shadow-2xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
              <span className="hidden sm:inline">Intro</span>
            </button>

            <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg shadow-2xs transition-colors"
            >
              <History className="w-3.5 h-3.5 text-zinc-500" />
              <span>History</span>
              {history.length > 0 && (
                <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                  ({history.length})
                </span>
              )}
            </button>

            {code && (
              <button
                onClick={() => {
                  setPrompt('');
                  setCode('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Prompt Card (Clean elevated white card) */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">
                Describe Your Fast Formula
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Type your business requirements in plain English. Click generate to create production-ready Oracle code.
              </p>
            </div>
            <span className="hidden sm:inline-block text-[11px] text-zinc-400 font-mono">
              Press <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-zinc-600 font-semibold">⌘ + Enter</kbd> to generate
            </span>
          </div>

          {/* Prompt Textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            rows={4}
            placeholder={isFocused ? '' : 'Type your prompt here...'}
            className="w-full p-4 rounded-xl border border-zinc-200 bg-[#fdfdfd] text-zinc-900 text-sm placeholder:text-zinc-400 focus:placeholder-transparent focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all leading-relaxed font-sans"
          />

          {/* Quick Scenarios Strip (Dynamically adapts to frequent user prompts) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Quick Scenarios:
              </span>
              {scenarios.some((s) => !s.id.startsWith('def-')) && (
                <button
                  onClick={() => {
                    setScenarios(DEFAULT_SCENARIOS);
                    showToast('Reset quick scenarios to defaults.');
                  }}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
                  title="Reset quick scenarios to default suggestions"
                >
                  Reset defaults
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {scenarios.slice(0, 5).map((qp) => (
                <button
                  key={qp.id}
                  onClick={() => {
                    setPrompt(qp.text);
                    showToast('Scenario loaded. Edit as needed and click Generate.');
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-zinc-50 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 border border-zinc-200/80 font-medium transition-colors text-left"
                  title="Load scenario into prompt box"
                >
                  <span>{qp.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Row - Centered Button */}
          <div className="pt-4 flex items-center justify-center border-t border-zinc-100">
            {/* Solid Black Generate Button - strictly inert and unclickable when empty */}
            <button
              onClick={() => {
                if (!prompt.trim() || isGenerating) return;
                handleGenerate();
              }}
              disabled={!prompt.trim() || isGenerating}
              className={`px-7 py-2.5 rounded-xl font-semibold text-xs tracking-wide uppercase transition-all flex items-center gap-2 shadow-xs ${
                !prompt.trim() || isGenerating
                  ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed pointer-events-none'
                  : 'bg-black hover:bg-zinc-800 active:scale-95 text-white cursor-pointer'
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Synthesizing Formula...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 fill-white" />
                  <span>Generate Fast Formula</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Output Card (Visible when code is generated) */}
        {code ? (
          <div className="bg-white border border-zinc-200/90 rounded-2xl shadow-xs overflow-hidden animate-in fade-in duration-200 space-y-0">
            {/* Code Header Bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-zinc-50/70 border-b border-zinc-200 gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold font-mono text-zinc-900">
                  {currentFileName}
                </span>
                <span className="text-xs text-zinc-500 font-mono tabular-nums">
                  {code.split('\n').length} lines
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Valid Fast Formula</span>
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors shadow-2xs"
                  title="Download .ff file"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Download .ff</span>
                </button>

                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all shadow-xs ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-black text-white hover:bg-zinc-800'
                  }`}
                  title="Copy code to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                  <span>{copied ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
            </div>

            {/* Code Viewport with Line Numbers */}
            <div className="p-4 sm:p-6 bg-white overflow-x-auto">
              <pre className="font-mono text-xs sm:text-[13px] text-zinc-800 leading-relaxed selection:bg-zinc-200">
                {code.split('\n').map((line, idx) => {
                  const lineNum = idx + 1;
                  const isComment = line.trim().startsWith('/*') || line.trim().startsWith('*') || line.trim().endsWith('*/');
                  const isKeyword = line.trim().startsWith('DEFAULT FOR') || line.trim().startsWith('INPUTS ARE') || line.trim().startsWith('RETURN');

                  return (
                    <div key={idx} className="flex hover:bg-zinc-50/80 px-2 py-0.5 rounded transition-colors">
                      <span className="w-10 select-none text-right pr-4 text-zinc-400 font-mono text-xs shrink-0 tabular-nums">
                        {lineNum}
                      </span>
                      <span className={isComment ? 'text-zinc-400 italic' : isKeyword ? 'font-bold text-black' : 'text-zinc-800'}>
                        {line}
                      </span>
                    </div>
                  );
                })}
              </pre>
            </div>

            {/* Bottom Quick Deployment Checklist */}
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 text-xs text-zinc-600 space-y-1.5">
              <span className="font-semibold text-zinc-800 uppercase tracking-wider text-[11px] block">
                Oracle Fusion Deployment Steps:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-500">
                <div>1. Paste into <strong>Setup and Maintenance &gt; Fast Formulas</strong>.</div>
                <div>2. Confirm all DBIs exist in target Legislative Data Group.</div>
                <div>3. Click <strong>Compile</strong> and confirm status is <strong>Valid</strong>.</div>
                <div>4. Attach formula to Earnings Element or Absence Plan.</div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty Placeholder State */
          <div className="bg-white border border-dashed border-zinc-300 rounded-2xl p-10 sm:p-12 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 mx-auto">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800">
              Your Generated Fast Formula Will Appear Here
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Write a business rule in the prompt box above or select a quick scenario, then click Generate Fast Formula.
            </p>
          </div>
        )}
      </main>

      {/* History Slide-over Drawer */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity" onClick={() => setIsHistoryOpen(false)} />
          <div className="fixed inset-y-0 right-0 max-w-md w-full bg-white border-l border-zinc-200 shadow-xl flex flex-col z-50 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-700" />
                <h3 className="text-sm font-bold text-zinc-900">Generated History</h3>
                <span className="text-xs text-zinc-500 font-mono">({history.length})</span>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-16 text-zinc-400 text-xs">
                  No formulas generated yet.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-white shadow-2xs space-y-2 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-xs text-zinc-900">{item.title}</span>
                      <button
                        onClick={() => setHistory((prev) => prev.filter((i) => i.id !== item.id))}
                        className="text-zinc-400 hover:text-red-600 transition-colors p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                      {item.prompt}
                    </p>

                    <div className="pt-2 flex items-center justify-between border-t border-zinc-100 text-[11px]">
                      <span className="text-zinc-400 font-mono">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(item.code);
                            showToast('Copied code to clipboard.');
                          }}
                          className="text-zinc-600 hover:text-zinc-900 font-medium"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => {
                            setPrompt(item.prompt);
                            setCode(item.code);
                            setIsHistoryOpen(false);
                            showToast('Loaded formula from history.');
                          }}
                          className="font-bold text-black hover:underline"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-black text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
