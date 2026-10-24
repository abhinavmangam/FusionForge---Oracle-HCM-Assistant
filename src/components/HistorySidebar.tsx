import React, { useState } from 'react';
import { HistoryItem } from '../types';
import { X, Search, Trash2, ArrowUpRight, Copy, Check, Clock, Download } from 'lucide-react';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onRestoreItem: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onCopySuccess: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  history,
  onRestoreItem,
  onDeleteItem,
  onClearAll,
  onCopySuccess,
}) => {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredHistory = history.filter((item) => {
    return (
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.prompt.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    onCopySuccess();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportHistory = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `fusionforge_history_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col transition-all">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <span className="font-semibold text-sm text-white">Generated History</span>
          <span className="text-xs text-zinc-500 font-mono tabular-nums">({history.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          aria-label="Close history"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="p-4 border-b border-zinc-800 space-y-3 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved formulas..."
            className="w-full pl-9 pr-3 py-1.5 bg-black border border-zinc-800 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        {history.length > 0 && (
          <div className="flex items-center justify-between text-xs pt-1">
            <button
              onClick={handleExportHistory}
              className="text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={onClearAll}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* History Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-xs space-y-2">
            <Clock className="w-8 h-8 mx-auto text-zinc-700" />
            <p>No formulas saved in history.</p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-semibold text-white truncate">{item.title}</h4>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Delete item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">{item.prompt}</p>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px]">
                <span className="text-zinc-500 font-mono tabular-nums">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(item.code, item.id)}
                    className="text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3 h-3 text-white" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      onRestoreItem(item);
                      onClose();
                    }}
                    className="text-white hover:underline font-medium flex items-center gap-1"
                  >
                    <span>Load</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
