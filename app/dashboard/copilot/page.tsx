'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Copilot ready. Query your trades and journal directly.

Ask things like:
* "What is my win rate and expectancy for forex trades?"
* "Show me my 5 most recent closed trades."
* "Search my journals for mentions of 'revenge' or 'FOMO'."`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: textToSend };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to communicate with Copilot');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err.message || 'Could not connect to Gemini API. Ensure GEMINI_API_KEY is configured in your environment.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

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
      // Formatting real P&L / R-multiples / percentages as gain or loss
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

  return (
    <main className="flex h-full flex-col bg-base">
      <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
        <div>
          <h1 className="font-display text-primary text-xl font-bold uppercase tracking-wide">AI Copilot</h1>
          <p className="text-secondary mt-1 text-xs">
            Your interactive trading analysis terminal. Query performance, analyze setups, and inspect daily logs.
          </p>
        </div>

        <div className="border-hairline bg-surface rounded-card border flex flex-col overflow-hidden min-h-0 flex-1">
          {/* Chat History Area */}
          <div className="no-scrollbar flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.map((m, idx) => {
            const isAssistant = m.role === 'assistant';
            return (
              <div key={idx} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-card border p-3.5 ${
                    isAssistant
                      ? 'bg-surface border-hairline text-primary'
                      : 'bg-surface-raised border-accent-signal/30 text-primary'
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider text-tertiary font-display block mb-1.5">
                    {isAssistant ? 'Copilot' : 'You'}
                  </span>
                  <div className="space-y-1">{formatMessageContent(m.content)}</div>
                </div>
              </div>
            );
          })}
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
        {messages.length === 1 && (
          <div className="px-4 py-2 border-t border-hairline/40 flex flex-wrap gap-2">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleChipClick(prompt)}
                disabled={loading}
                className="text-[10px] font-display border border-hairline hover:border-accent-signal/40 bg-surface-raised text-secondary px-3 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Message Input Form */}
        <div className="p-3 border-t border-hairline/60 bg-surface">
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
              disabled={loading}
              className="flex-1 bg-surface-raised border border-hairline focus:border-accent-signal/80 rounded px-3 py-2 text-xs text-primary outline-none transition-colors disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="bg-accent-signal hover:bg-accent-signal/90 disabled:bg-surface-raised disabled:text-tertiary disabled:border-hairline text-base font-display font-semibold text-xs px-5 rounded-card border border-transparent transition-colors duration-150"
            >
              SEND
            </button>
          </form>
        </div>
        </div>
      </div>
    </main>
  );
}
