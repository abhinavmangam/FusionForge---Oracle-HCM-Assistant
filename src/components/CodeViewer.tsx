import React, { useState } from 'react';
import { Copy, Check, Download, Edit3, Eye, CheckCircle2, RotateCw } from 'lucide-react';
import { ValidationResult } from '../types';

interface CodeViewerProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  fileName: string;
  validationResult: ValidationResult;
  onFormat: () => void;
  onCopySuccess: () => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  code,
  onChangeCode,
  fileName,
  validationResult,
  onFormat,
  onCopySuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopySuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  const handleDownload = () => {
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

  // Grayscale syntax highlighter for Fast Formulas
  const renderHighlightedCode = () => {
    const lines = code.split('\n');

    return lines.map((line, idx) => {
      const lineNum = idx + 1;
      let styledContent: React.ReactNode = line;

      const trimmed = line.trim();

      // Comment lines
      if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.endsWith('*/')) {
        styledContent = <span className="text-zinc-500 italic">{line}</span>;
      } else if (trimmed.startsWith('DEFAULT FOR')) {
        const parts = line.split(/(DEFAULT FOR|\bIS\b)/g);
        styledContent = (
          <span>
            {parts.map((part, i) => {
              if (part === 'DEFAULT FOR' || part === 'IS') {
                return (
                  <span key={i} className="text-white font-semibold">
                    {part}
                  </span>
                );
              }
              if (part.includes("'")) {
                return (
                  <span key={i} className="text-zinc-300">
                    {part}
                  </span>
                );
              }
              return (
                <span key={i} className="text-zinc-100 font-medium">
                  {part}
                </span>
              );
            })}
          </span>
        );
      } else if (trimmed.startsWith('INPUTS ARE')) {
        styledContent = (
          <span>
            <span className="text-white font-semibold">INPUTS ARE</span>
            <span className="text-zinc-300">{line.replace('INPUTS ARE', '')}</span>
          </span>
        );
      } else if (trimmed.startsWith('RETURN')) {
        styledContent = (
          <span>
            <span className="text-white font-bold tracking-wide">RETURN</span>
            <span className="text-zinc-200">{line.replace('RETURN', '')}</span>
          </span>
        );
      } else {
        // Tokenize logic lines
        const regex =
          /(\b(?:IF|THEN|ELSE|ENDIF|AND|OR|NOT|IS|NULL)\b|\b(?:GET_CONTEXT|ESS_LOG_WRITE|SET_LOG|TO_CHAR|TO_NUMBER|TO_DATE|ROUND|TRUNC|DAYS_BETWEEN)\b|'[^']*'|\b\d+(?:\.\d+)?\b)/g;
        const segments = line.split(regex);

        styledContent = (
          <span>
            {segments.map((seg, sIdx) => {
              if (!seg) return null;
              if (['IF', 'THEN', 'ELSE', 'ENDIF', 'AND', 'OR', 'NOT', 'IS', 'NULL'].includes(seg)) {
                return (
                  <span key={sIdx} className="text-white font-semibold">
                    {seg}
                  </span>
                );
              }
              if (
                [
                  'GET_CONTEXT',
                  'ESS_LOG_WRITE',
                  'SET_LOG',
                  'TO_CHAR',
                  'TO_NUMBER',
                  'TO_DATE',
                  'ROUND',
                  'TRUNC',
                  'DAYS_BETWEEN',
                ].includes(seg)
              ) {
                return (
                  <span key={sIdx} className="text-zinc-200 font-medium">
                    {seg}
                  </span>
                );
              }
              if (seg.startsWith("'") && seg.endsWith("'")) {
                return (
                  <span key={sIdx} className="text-zinc-300">
                    {seg}
                  </span>
                );
              }
              if (/^\d+(\.\d+)?$/.test(seg)) {
                return (
                  <span key={sIdx} className="text-zinc-400 tabular-nums">
                    {seg}
                  </span>
                );
              }
              if (seg.startsWith('l_') || seg.startsWith('L_')) {
                return (
                  <span key={sIdx} className="text-zinc-100">
                    {seg}
                  </span>
                );
              }
              return <span key={sIdx} className="text-zinc-300">{seg}</span>;
            })}
          </span>
        );
      }

      return (
        <div
          key={idx}
          className="flex items-start hover:bg-zinc-900/60 px-4 py-0.5 font-mono text-[13px] leading-relaxed transition-colors"
        >
          <span className="w-10 select-none text-right pr-4 text-zinc-600 text-xs shrink-0 tabular-nums">
            {lineNum}
          </span>
          <div className="flex-1 overflow-x-auto whitespace-pre">{styledContent}</div>
        </div>
      );
    });
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shadow-lg">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-white font-mono">{fileName}</span>
          <span className="text-xs text-zinc-500 font-mono tabular-nums">
            {lineCount} lines · {code.length} characters
          </span>
          <span className="text-xs text-zinc-400 font-mono flex items-center gap-1 pl-2 border-l border-zinc-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Valid Oracle FF</span>
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
              isEditing
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
            title={isEditing ? 'View formatted code' : 'Edit raw code'}
          >
            {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isEditing ? 'View' : 'Edit'}</span>
          </button>

          <button
            onClick={onFormat}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded transition-colors"
            title="Clean whitespace and format code"
          >
            <RotateCw className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Format</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded transition-colors"
            title="Export as .ff file"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Download</span>
          </button>

          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-colors ${
              copied
                ? 'bg-zinc-200 text-black'
                : 'bg-white text-black hover:bg-zinc-200'
            }`}
            title="Copy code to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5 text-black" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Code Editor / Highlighting Body */}
      <div className="overflow-auto bg-black font-mono text-[13px] relative min-h-[460px] max-h-[680px]">
        {isEditing ? (
          <textarea
            value={code}
            onChange={(e) => onChangeCode(e.target.value)}
            className="w-full h-full min-h-[460px] p-4 bg-black text-zinc-100 font-mono text-[13px] leading-relaxed resize-none focus:outline-none border-0"
            spellCheck={false}
          />
        ) : (
          <div className="py-3">{renderHighlightedCode()}</div>
        )}
      </div>

      {/* Validation Notes (if issues or recommendations exist) */}
      {validationResult.issues.length > 0 && (
        <div className="border-t border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-300">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-zinc-200">Syntax &amp; Configuration Tips</span>
            <span className="text-zinc-500 font-mono text-[11px] tabular-nums">
              ({validationResult.issues.length} items)
            </span>
          </div>
          <div className="space-y-1">
            {validationResult.issues.map((issue) => (
              <div key={issue.id} className="text-zinc-400 text-[11px] flex items-baseline gap-2">
                <span className="text-zinc-500 font-mono">·</span>
                <span>{issue.message}</span>
                {issue.suggestion && (
                  <span className="text-zinc-300 font-mono">{issue.suggestion}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
