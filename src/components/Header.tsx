import React from 'react';
import { History, Sparkles } from 'lucide-react';

interface HeaderProps {
  historyCount: number;
  onToggleHistory: () => void;
  onReset: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  historyCount,
  onToggleHistory,
  onReset,
}) => {
  return (
    <header className="border-b border-zinc-800/80 bg-black/90 backdrop-blur sticky top-0 z-40 px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2.5 text-left focus:outline-none group"
            title="Reset to home"
          >
            <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-white font-bold text-sm">
              FF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white font-sans group-hover:text-zinc-200 transition-colors">
                  FusionForge
                </span>
                <span className="text-[11px] text-zinc-400 font-mono tracking-wider uppercase">
                  Fast Formula
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleHistory}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors"
          >
            <History className="w-3.5 h-3.5 text-zinc-400" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                ({historyCount})
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
