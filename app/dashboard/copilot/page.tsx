'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Plus, MessageSquare, Trash2, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/components/copilot/copilot-provider';

export default function CopilotPage() {
  const {
    sessions,
    activeSessionId,
    messages,
    input,
    setInput,
    loading,
    loadingMessages,
    sidebarOpen,
    setSidebarOpen,
    handleSelectSession,
    handleNewChat,
    handleDeleteSession,
    handleSend,
  } = useCopilot();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleChipClick = (prompt: string) => {
    handleSend(prompt);
  };


  const parseInlineFormatting = (text: string) => {
    const regex = /(\*\*.*?\*\*|`.*?`|\+[\d\.,]+%|\-[\d\.,]+%|\+[\d\.,]+R|\-[\d\.,]+R|\+[\d\.,\$\s]+|\-[\d\.,\$\s]+)/g;
    const splitParts = text.split(regex);

    return splitParts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-bold text-primary">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="num bg-surface-raised border border-hairline rounded px-1.5 py-0.5 text-[10px] text-accent-signal font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      const isPositive = part.startsWith('+');
      const isNegative = part.startsWith('-');
      const isPnLorR = part.endsWith('%') || part.endsWith('R') || part.includes('$') || part.includes('P&L');

      if (isPnLorR && (isPositive || isNegative)) {
        return (
          <span key={index} className={`num font-semibold ${isPositive ? 'text-gain' : 'text-loss'}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const formatMessageContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="font-display text-primary text-xs uppercase tracking-wider mt-4 mb-2 font-bold">
            {line.slice(4)}
          </h4>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3 key={idx} className="font-display text-primary text-sm font-bold uppercase mt-4 mb-2">
            {line.slice(3)}
          </h3>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h2 key={idx} className="font-display text-primary text-base font-bold uppercase mt-5 mb-3">
            {line.slice(2)}
          </h2>
        );
      }
      if (line.startsWith('* ') || line.startsWith('- ')) {
        return (
          <ul key={idx} className="list-disc pl-5 text-xs text-primary my-1 space-y-1">
            <li>{parseInlineFormatting(line.slice(2))}</li>
          </ul>
        );
      }
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.includes('---')) return null;
        const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
        return (
          <div key={idx} className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border-b border-hairline/30 py-1.5">
            {cells.map((cell, cidx) => (
              <span key={cidx} className={cidx % 2 === 1 ? 'num text-right' : 'text-secondary font-semibold'}>
                {parseInlineFormatting(cell)}
              </span>
            ))}
          </div>
        );
      }
      return (
        <p key={idx} className="text-xs leading-relaxed my-1.5">
          {parseInlineFormatting(line)}
        </p>
      );
    });
  };

  const quickPrompts = [
    'What is my overall win rate?',
    'Show my crypto trade statistics',
    "Search my journals for FOMO or revenge",
    'Show my 5 most recent closed trades'
  ];

  const formatSessionDate = (dateVal: Date | string) => {
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Sidebar history component content
  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="font-display text-primary text-[10px] uppercase tracking-wider font-bold">
          Chat History
        </span>
        <button
          onClick={handleNewChat}
          className="border-hairline bg-base hover:text-accent-signal text-secondary flex h-7 w-7 items-center justify-center rounded-card border transition-colors cursor-pointer"
          title="New Chat"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
        {sessions.length === 0 ? (
          <p className="text-tertiary text-xs p-3 text-center">No previous chats</p>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                className={cn(
                  'group flex items-center justify-between px-3 py-2.5 rounded-card border text-xs cursor-pointer transition-colors duration-150',
                  isActive
                    ? 'bg-surface-raised border-accent-signal/30 text-accent-signal'
                    : 'bg-transparent border-transparent text-secondary hover:text-primary hover:bg-surface-raised/40'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare size={13} className="shrink-0" />
                  <span className="truncate font-sans font-medium">{s.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[9px] text-tertiary font-mono">
                    {formatSessionDate(s.createdAt)}
                  </span>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-loss p-0.5 transition-opacity"
                    title="Delete Chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <main className="flex h-full flex-row bg-base overflow-hidden">
      {/* 1. Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 shrink-0 border-r border-hairline bg-surface p-4 flex-col h-full">
        {sidebarContent}
      </aside>

      {/* 2. Mobile Sidebar Slide-over */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-base/80 backdrop-blur-sm">
          <div className="w-72 border-r border-hairline bg-surface flex flex-col h-full p-4 relative">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-4 top-4 text-secondary hover:text-primary p-1 rounded-sm border border-hairline bg-base cursor-pointer"
            >
              <X size={16} />
            </button>
            <div className="mt-8 flex-1 h-full overflow-hidden">
              {sidebarContent}
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Chat Area */}
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        {/* Header Bar */}
        <header className="border-b border-hairline px-4 py-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-secondary hover:text-primary border border-hairline rounded bg-surface p-1.5 cursor-pointer"
              title="View History"
            >
              <Menu size={16} />
            </button>
            <div>
              <h1 className="font-display text-primary text-sm font-bold uppercase tracking-wide">
                AI Copilot
              </h1>
              <p className="text-secondary text-[10px] hidden sm:block mt-0.5">
                Your interactive trading analysis terminal. Query performance, analyze setups, and inspect daily logs.
              </p>
            </div>
          </div>
          
          <button
            onClick={handleNewChat}
            className="lg:hidden border-hairline bg-surface hover:text-accent-signal text-secondary flex items-center justify-center gap-1.5 rounded-card border px-3 py-1.5 text-xs transition-colors cursor-pointer font-sans font-medium"
          >
            <Plus size={12} /> New Chat
          </button>
        </header>

        {/* Chat Feed */}
        <div className="flex-grow overflow-y-auto no-scrollbar p-4 space-y-4 min-h-0 bg-base">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin h-5 w-5 border-2 border-accent-signal border-t-transparent rounded-card" />
                <p className="text-secondary text-xs">Retrieving conversation history...</p>
              </div>
            </div>
          ) : (
            messages.map((m, idx) => {
              const isAssistant = m.role === 'assistant';
              return (
                <div key={idx} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-card border p-3.5',
                      isAssistant
                        ? 'bg-surface border-hairline text-primary'
                        : 'bg-surface-raised border-accent-signal/30 text-primary'
                    )}
                  >
                    <span className="text-[9px] uppercase tracking-wider text-tertiary font-display block mb-1.5">
                      {isAssistant ? 'Copilot' : 'You'}
                    </span>
                    <div className="space-y-1">{formatMessageContent(m.content)}</div>
                  </div>
                </div>
              );
            })
          )}
          
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-surface border-hairline rounded-card border p-3.5 space-y-2">
                <span className="text-[9px] uppercase tracking-wider text-tertiary font-display block">
                  Copilot is analyzing...
                </span>
                <div className="flex items-center gap-1.5 text-xs text-secondary mt-1">
                  <div className="animate-spin h-3.5 w-3.5 border border-accent-signal border-t-transparent rounded-card" />
                  <span>Scanning databases & computing statistics</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        {messages.length === 1 && !loadingMessages && (
          <div className="px-4 py-2 border-t border-hairline/40 flex flex-wrap gap-2 shrink-0 bg-base">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleChipClick(prompt)}
                disabled={loading}
                className="text-[10px] font-display border border-hairline hover:border-accent-signal/40 bg-surface text-secondary px-3 py-1.5 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 border-t border-hairline bg-surface shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Copilot about your trade statistics or logs..."
              disabled={loading || loadingMessages}
              className="flex-1 bg-surface-raised border border-hairline focus:border-accent-signal/80 rounded px-3 py-2 text-xs text-primary outline-none transition-colors disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || loadingMessages}
              className="bg-accent-signal hover:bg-accent-signal/90 disabled:bg-surface-raised disabled:text-tertiary disabled:border-hairline text-base font-display font-semibold text-xs px-5 rounded-card border border-transparent transition-colors duration-150 cursor-pointer"
            >
              SEND
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
