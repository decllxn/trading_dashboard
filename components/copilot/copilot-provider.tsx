'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getSessions,
  getSessionMessages,
  createSession,
  saveMessage,
  deleteSession,
} from '@/app/dashboard/copilot/actions';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CopilotSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CopilotContextType {
  sessions: CopilotSession[];
  setSessions: React.Dispatch<React.SetStateAction<CopilotSession[]>>;
  activeSessionId: string | null;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  loadingMessages: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSelectSession: (sessionId: string) => Promise<void>;
  handleNewChat: () => void;
  handleDeleteSession: (e: React.MouseEvent, sessionId: string) => Promise<void>;
  handleSend: (textToSend: string) => Promise<void>;
}

const CopilotContext = createContext<CopilotContextType | undefined>(undefined);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
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
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setSidebarOpen(false);
    setMessages([
      {
        role: 'assistant',
        content: `Copilot ready. Query your trades and journal directly.

Ask things like:
* "What is my win rate and expectancy for forex trades?"
* "Show me my 5 most recent closed trades."
* "Search my journals for mentions of 'revenge' or 'FOMO'."`
      }
    ]);
  }, []);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    setSidebarOpen(false);
    try {
      const dbMsgs = await getSessionMessages(sessionId);
      if (dbMsgs.length > 0) {
        setMessages(
          dbMsgs.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))
        );
      } else {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to load messages for session:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [handleNewChat]);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [activeSessionId, handleNewChat]);

  const handleSend = useCallback(async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    let currentSessionId = activeSessionId;
    let updatedMessages = [...messages];

    // If first message is welcome helper, clear it from history sent to model
    if (messages.length === 1 && messages[0].content.startsWith('Copilot ready.')) {
      updatedMessages = [];
    }

    const userMessage: Message = { role: 'user', content: textToSend };
    updatedMessages.push(userMessage);

    // Optimistically update UI
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].content.startsWith('Copilot ready.')) {
        return [userMessage];
      }
      return [...prev, userMessage];
    });

    setInput('');
    setLoading(true);

    try {
      // 1. If new chat, create session in database
      if (!currentSessionId) {
        const title = textToSend.slice(0, 30) + (textToSend.length > 30 ? '...' : '');
        const newSession = await createSession(title);
        currentSessionId = newSession.id;
        setActiveSessionId(newSession.id);
        
        const list = await getSessions();
        setSessions(list);
      }

      // 2. Save user message to database
      await saveMessage(currentSessionId, 'user', textToSend);

      // 3. Request response from Copilot API
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

      // 4. Save assistant response to database
      await saveMessage(currentSessionId, 'assistant', data.response);

      // 5. Update UI
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      
      const list = await getSessions();
      setSessions(list);

    } catch (err: any) {
      console.error(err);
      const errMessage = `Error: ${err.message || 'Could not connect to Copilot API.'}`;
      
      if (currentSessionId) {
        await saveMessage(currentSessionId, 'assistant', errMessage);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errMessage,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, messages, loading]);

  // Load chat sessions on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const list = await getSessions();
        setSessions(list);
        
        // Auto-load the most recent session if available
        if (list.length > 0) {
          await handleSelectSession(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load copilot sessions:', err);
      }
    }
    loadSessions();
  }, [handleSelectSession]);

  return (
    <CopilotContext.Provider
      value={{
        sessions,
        setSessions,
        activeSessionId,
        setActiveSessionId,
        messages,
        setMessages,
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
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot() {
  const context = useContext(CopilotContext);
  if (context === undefined) {
    throw new Error('useCopilot must be used within a CopilotProvider');
  }
  return context;
}
