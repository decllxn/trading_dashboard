'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getSessions,
  getSessionMessages,
  createSession,
  saveMessage,
  deleteSession,
} from '@/app/dashboard/copilot/actions';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  versions?: string[];
  activeVersionIdx?: number;
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
  handleEditPrompt: (msgIndex: number, newText: string) => Promise<void>;
  handleCancelRequest: () => void;
}

const CopilotContext = createContext<CopilotContextType | undefined>(undefined);

const DEFAULT_WELCOME = `SJ is ready. Query your trades and journal directly.

Ask things like:
* "What is my win rate and expectancy for forex trades?"
* "Show me my 5 most recent closed trades."
* "Search my journals for mentions of 'revenge' or 'FOMO'."`;

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: DEFAULT_WELCOME
    }
  ]);
  const [input, setInput] = useState('');
  
  // Track loading status per session ID ('temp' for unsaved new sessions)
  const [loadingSessions, setLoadingSessions] = useState<Record<string, boolean>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Map of active AbortControllers per session ID
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Keeps track of the active session ID inside async call operations
  const activeSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const handleNewChat = useCallback(() => {
    // We do NOT abort other background requests, only clear active session state
    setActiveSessionId(null);
    setSidebarOpen(false);
    setMessages([
      {
        role: 'assistant',
        content: DEFAULT_WELCOME
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
        // If the active session changes back to this session, load its messages
        if (activeSessionIdRef.current === sessionId) {
          setMessages(
            dbMsgs.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          );
        }
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
      // Abort controller if deleting active loading session
      const controller = abortControllersRef.current[sessionId];
      if (controller) {
        controller.abort();
        delete abortControllersRef.current[sessionId];
      }
      
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
    const activeKey = activeSessionId || 'temp';
    if (!textToSend.trim() || loadingSessions[activeKey]) return;

    let currentSessionId = activeSessionId;
    let updatedMessages = [...messages];

    // If first message is welcome helper, clear it from history sent to model
    if (messages.length === 1 && messages[0].content.startsWith('SJ is ready.')) {
      updatedMessages = [];
    }

    const userMessage: Message = { role: 'user', content: textToSend };
    updatedMessages.push(userMessage);

    // Optimistically update UI if this is the active session
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].content.startsWith('SJ is ready.')) {
        return [userMessage];
      }
      return [...prev, userMessage];
    });

    setInput('');
    
    // Set loading for this session
    setLoadingSessions((prev) => ({ ...prev, [activeKey]: true }));

    // Set abort controller for this session
    const controller = new AbortController();
    abortControllersRef.current[activeKey] = controller;

    try {
      // 1. If new chat, create session in database
      if (!currentSessionId) {
        const title = textToSend.slice(0, 30) + (textToSend.length > 30 ? '...' : '');
        const newSession = await createSession(title);
        currentSessionId = newSession.id;
        
        // Re-key the abort controller and loading states from 'temp' to the new session ID
        abortControllersRef.current[newSession.id] = controller;
        delete abortControllersRef.current['temp'];

        setLoadingSessions((prev) => {
          const next = { ...prev };
          next[newSession.id] = true;
          delete next['temp'];
          return next;
        });

        // Set active session ID
        if (activeSessionIdRef.current === null) {
          setActiveSessionId(newSession.id);
        }
        
        const list = await getSessions();
        setSessions(list);
      }

      // 2. Save user message to database
      await saveMessage(currentSessionId, 'user', textToSend);

      // 3. Request response from Copilot API
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages.map(m => ({ role: m.role, content: m.content })) }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to communicate with Copilot');
      }

      const data = await res.json();

      // 4. Save assistant response to database
      await saveMessage(currentSessionId, 'assistant', data.response);

      // 5. Update UI only if the user is still on the same session
      if (currentSessionId === activeSessionIdRef.current) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      }
      
      const list = await getSessions();
      setSessions(list);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`Request for session ${currentSessionId || 'temp'} was cancelled`);
        return;
      }
      console.error(err);
      const errMessage = `Error: ${err.message || 'Could not connect to Copilot API.'}`;
      
      if (currentSessionId) {
        await saveMessage(currentSessionId, 'assistant', errMessage);
      }

      if (currentSessionId === activeSessionIdRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: errMessage,
          },
        ]);
      }
    } finally {
      const keyToClear = currentSessionId || 'temp';
      if (abortControllersRef.current[keyToClear] === controller) {
        delete abortControllersRef.current[keyToClear];
      }
      setLoadingSessions((prev) => {
        const next = { ...prev };
        delete next[keyToClear];
        return next;
      });
    }
  }, [activeSessionId, messages, loadingSessions]);

  // Support editing a past user prompt (frontier UI style)
  const handleEditPrompt = useCallback(async (msgIndex: number, newText: string) => {
    const activeKey = activeSessionId || 'temp';
    if (!newText.trim() || loadingSessions[activeKey]) return;
    
    // Stop any active request for this session
    const oldController = abortControllersRef.current[activeKey];
    if (oldController) {
      oldController.abort();
      delete abortControllersRef.current[activeKey];
    }

    // Retrieve targets
    const targetMsg = messages[msgIndex];
    if (!targetMsg || targetMsg.role !== 'user') return;

    // Build the version tracks
    const currentVersions = targetMsg.versions || [targetMsg.content];
    const newVersions = [...currentVersions];
    
    // If not already in the version list, append it
    let activeIdx = newVersions.indexOf(newText);
    if (activeIdx === -1) {
      newVersions.push(newText);
      activeIdx = newVersions.length - 1;
    }

    // Cut off all messages after this prompt so we can restart the chain from this edit
    const baseHistory = messages.slice(0, msgIndex);
    const editedUserMsg: Message = {
      role: 'user',
      content: newText,
      versions: newVersions,
      activeVersionIdx: activeIdx
    };

    const nextHistory = [...baseHistory, editedUserMsg];
    setMessages(nextHistory);
    
    // Set loading for this session
    setLoadingSessions((prev) => ({ ...prev, [activeKey]: true }));

    const controller = new AbortController();
    abortControllersRef.current[activeKey] = controller;

    let currentSessionId = activeSessionId;

    try {
      if (!currentSessionId) {
        const title = newText.slice(0, 30) + (newText.length > 30 ? '...' : '');
        const newSession = await createSession(title);
        currentSessionId = newSession.id;

        // Re-key references
        abortControllersRef.current[newSession.id] = controller;
        delete abortControllersRef.current['temp'];

        setLoadingSessions((prev) => {
          const next = { ...prev };
          next[newSession.id] = true;
          delete next['temp'];
          return next;
        });

        if (activeSessionIdRef.current === null) {
          setActiveSessionId(newSession.id);
        }
        const list = await getSessions();
        setSessions(list);
      }

      // Save edited prompt to the database as a new user message
      await saveMessage(currentSessionId, 'user', newText);

      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory.map(m => ({ role: m.role, content: m.content })) }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to communicate with Copilot');
      }

      const data = await res.json();
      await saveMessage(currentSessionId, 'assistant', data.response);

      if (currentSessionId === activeSessionIdRef.current) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      }
      const list = await getSessions();
      setSessions(list);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`Request edit for session ${currentSessionId || 'temp'} was cancelled`);
        return;
      }
      console.error(err);
      const errMessage = `Error: ${err.message || 'Could not connect to Copilot API.'}`;
      if (currentSessionId) {
        await saveMessage(currentSessionId, 'assistant', errMessage);
      }
      if (currentSessionId === activeSessionIdRef.current) {
        setMessages((prev) => [...prev, { role: 'assistant', content: errMessage }]);
      }
    } finally {
      const keyToClear = currentSessionId || 'temp';
      if (abortControllersRef.current[keyToClear] === controller) {
        delete abortControllersRef.current[keyToClear];
      }
      setLoadingSessions((prev) => {
        const next = { ...prev };
        delete next[keyToClear];
        return next;
      });
    }
  }, [messages, loadingSessions, activeSessionId]);

  // Cancel/Abort active request for the active session
  const handleCancelRequest = useCallback(() => {
    const activeKey = activeSessionId || 'temp';
    const controller = abortControllersRef.current[activeKey];
    if (controller) {
      controller.abort();
      delete abortControllersRef.current[activeKey];
      
      setLoadingSessions((prev) => {
        const next = { ...prev };
        delete next[activeKey];
        return next;
      });

      // Clear optimistic prompt UI for this active session
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
  }, [activeSessionId]);

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

  // Resolve loading status for the active session
  const activeKey = activeSessionId || 'temp';
  const loading = !!loadingSessions[activeKey];

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
        handleEditPrompt,
        handleCancelRequest
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
