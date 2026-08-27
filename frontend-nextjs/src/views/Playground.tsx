'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api } from '../services/api'
import type { Agent as ApiAgent, ChatRequest, Source, StreamDoneMeta, UsageInfo } from '../services/api';
import AdminLayout from '../components/AdminLayout';
import AISettingsForm from '../components/AISettingsForm';
import ChatPanel from '../components/ChatPanel';
import type { Message as ChatPanelMessage, Agent as ChatPanelAgent } from '../components/ChatPanel';
import { useIsMobile } from '../hooks/useMediaQuery';

interface ChatParamOverrides {
  temperature: number;
  max_tokens: number;
}

type TabType = 'settings' | 'preview';

/* Inspector section: retrieved context chunk cards fed by real chat message sources */
function RetrievedContext({ sources }: { sources: Source[] }) {
  const { t } = useTranslation('common');

  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {t('labels.retrievedContext')}
        </h3>
        <span className="badge badge-info">{t('labels.chunksCount', { count: String(sources.length) })}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {sources.map((source, idx) => (
          <div
            key={`${source.url ?? source.id ?? idx}`}
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              paddingLeft: 'calc(var(--space-3) + 4px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '3px',
                background: source.type === 'url' ? 'var(--color-success)' : 'var(--color-accent-primary)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {source.title || source.question || source.url || t(`sources.${source.type === 'file' ? 'fileItems' : 'links'}`, { count: 1 })}
                </span>
              </span>
            </div>
            {source.snippet && (
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  lineHeight: 1.6,
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {source.snippet}
              </p>
            )}
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-accent-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  wordBreak: 'break-all',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {source.url}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Playground() {
  const { t, i18n } = useTranslation('common');
  const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
  const isMobile = useIsMobile();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agent, setAgent] = useState<ChatPanelAgent | null>(null);
  const [messages, setMessages] = useState<ChatPanelMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [showSaved, setShowSaved] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [chatParams, setChatParams] = useState<ChatParamOverrides>({
    temperature: 0.7,
    max_tokens: 1024,
  });
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingMessageClientIdRef = useRef<number | null>(null);
  const nextMessageClientIdRef = useRef(0);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const streamRequestIdRef = useRef(0);

  useEffect(() => {
    loadDefaultAgent();
  }, [routeAgentId]);

  const loadDefaultAgent = async () => {
    try {
      const pathAgentId = typeof window !== 'undefined'
        ? window.location.pathname.match(/\/agents\/([^/]+)/)?.[1]
        : undefined;
      const currentAgentId = routeAgentId || pathAgentId;
      if (!currentAgentId) return;
      const data = await api.getAgent(currentAgentId);
      setAgent(data);
      setAgentId(data.id);
      setChatParams({
        temperature: data.temperature,
        max_tokens: data.max_tokens,
      });
    } catch (error) {
      console.error('Failed to load default agent:', error);
    }
  };

  const getErrorMessage = useCallback((error: unknown): string => {
    if (!(error instanceof Error)) {
      return t('errors.unknown');
    }

    const errorMessage = error.message.toLowerCase();

    // AI API errors
    if (errorMessage.includes('api key') || errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
      if (errorMessage.includes('jina')) {
        return t('errors.jinaApiKeyInvalid');
      }
      return t('errors.aiApiKeyInvalid');
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
      if (errorMessage.includes('jina')) {
        return t('errors.jinaApiTimeout');
      }
      return t('errors.aiApiTimeout');
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      if (errorMessage.includes('jina')) {
        return t('errors.jinaApiRateLimit');
      }
      return t('errors.aiApiRateLimit');
    }

    if (errorMessage.includes('quota') || errorMessage.includes('insufficient') || errorMessage.includes('billing')) {
      return t('errors.aiApiInsufficientQuota');
    }

    if (errorMessage.includes('model') && (errorMessage.includes('not found') || errorMessage.includes('does not exist'))) {
      return t('errors.aiApiModelNotFound');
    }

    // Jina specific errors
    if (errorMessage.includes('jina') || errorMessage.includes('embedding')) {
      return t('errors.jinaApiError');
    }

    // Rate limit from our backend
    if (errorMessage.includes('rate_limit_exceeded') || errorMessage.includes('conversation limit')) {
      return t('errors.rateLimitExceeded');
    }

    // Daily quota
    if (errorMessage.includes('quota exceeded') || errorMessage.includes('daily')) {
      return t('errors.dailyQuotaExceeded');
    }

    // No API key configured
    if (errorMessage.includes('no api key') || errorMessage.includes('not configured')) {
      return t('errors.noApiKeyConfigured');
    }

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
      return t('errors.networkError');
    }

    return t('errors.aiApiError');
  }, [t]);

  const handleSendMessage = useCallback(async () => {
    const effectiveAgentId = agentId || agent?.id || null;
    if (!input.trim() || isLoading || isSettingsSaving || !effectiveAgentId) return;

    streamAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;
    const requestId = ++streamRequestIdRef.current;

    const currentInput = input;
    const userMessageClientId = ++nextMessageClientIdRef.current;
    const streamingMessageClientId = ++nextMessageClientIdRef.current;

    const userMessage: ChatPanelMessage = {
      clientId: userMessageClientId,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    };

    const streamingMessage: ChatPanelMessage = {
      clientId: streamingMessageClientId,
      role: 'assistant',
      content: '',
      sources: [],
      isStreaming: true,
      timestamp: new Date(),
    };

    let streamSources: Source[] = [];

    const isStaleRequest = () => requestId !== streamRequestIdRef.current;

    const updateStreamingMessage = (
      updater: (message: ChatPanelMessage) => ChatPanelMessage,
      options?: { sync?: boolean }
    ) => {
      if (isStaleRequest()) {
        return;
      }

      const applyUpdate = () => {
        setMessages(prev => {
          const index = prev.findIndex(message => message.clientId === streamingMessageClientId);
          if (index === -1) {
            return prev;
          }

          const next = [...prev];
          next[index] = updater(next[index]);
          return next;
        });
      };

      if (options?.sync) {
        flushSync(applyUpdate);
      } else {
        applyUpdate();
      }
    };

    const finalizeStreamingMessage = (meta?: StreamDoneMeta, usage?: UsageInfo | null) => {
      if (isStaleRequest()) {
        return;
      }

      if (meta?.session_id) {
        setSessionId(meta.session_id);
      }

      if (meta?.taken_over) {
        setMessages(prev => prev.filter(message => message.clientId !== streamingMessageClientId));
        streamingMessageClientIdRef.current = null;
        return;
      }

      setMessages(prev => {
        const index = prev.findIndex(message => message.clientId === streamingMessageClientId);
        if (index === -1) {
          return prev;
        }

        const next = [...prev];
        next[index] = {
          ...next[index],
          sources: streamSources,
          usage: usage ?? meta?.usage ?? undefined,
          isStreaming: false,
          thinkingElapsed: undefined,
        };
        return next;
      });

      streamingMessageClientIdRef.current = null;
    };

    streamingMessageClientIdRef.current = streamingMessageClientId;
    setMessages(prev => [...prev, userMessage, streamingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const request: ChatRequest = {
        agent_id: effectiveAgentId,
        message: currentInput,
        locale: i18n.language,
        session_id: sessionId,
        params: {
          temperature: chatParams.temperature,
          max_tokens: chatParams.max_tokens,
        },
      };

      await api.streamChat(request, {
        onSources: (sources) => {
          if (isStaleRequest()) {
            return;
          }
          streamSources = sources;
          updateStreamingMessage(message => ({
            ...message,
            sources,
          }));
        },
        onThinking: (elapsed) => {
          if (isStaleRequest()) {
            return;
          }
          updateStreamingMessage(message => ({
            ...message,
            thinkingElapsed: elapsed,
          }));
        },
        onThinkingDone: () => {
          if (isStaleRequest()) {
            return;
          }
          updateStreamingMessage(message => ({
            ...message,
            thinkingElapsed: undefined,
          }));
        },
        onContent: (chunk) => {
          if (isStaleRequest()) {
            return;
          }
          updateStreamingMessage(message => ({
            ...message,
            content: message.content + chunk,
            thinkingElapsed: undefined,
          }), { sync: true });
        },
        onDone: (meta) => {
          finalizeStreamingMessage(meta);
        },
        onError: (error) => {
          throw new Error(error);
        },
      }, {
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted || isStaleRequest()) {
        return;
      }

      const fallbackError = getErrorMessage(error);
      setMessages(prev => prev.filter(message => message.clientId !== streamingMessageClientId));
      streamingMessageClientIdRef.current = null;
      const errorMessage: ChatPanelMessage = {
        role: 'assistant',
        content: fallbackError,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      if (streamAbortControllerRef.current === abortController) {
        streamAbortControllerRef.current = null;
      }
      if (!isStaleRequest()) {
        setIsLoading(false);
      }
    }
  }, [input, isLoading, isSettingsSaving, agentId, agent?.id, chatParams, sessionId, i18n.language, getErrorMessage]);

  const handleClearChat = useCallback(() => {
    if (confirm(t('playground.confirmClear'))) {
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
      streamRequestIdRef.current += 1;
      streamingMessageClientIdRef.current = null;
      setIsLoading(false);
      setMessages([]);
      setSessionId(undefined);
    }
  }, [t]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const handleSettingsSave = useCallback((updatedAgent?: ApiAgent) => {
    if (updatedAgent) {
      setAgent(updatedAgent);
      setAgentId(updatedAgent.id);
      setChatParams({
        temperature: updatedAgent.temperature,
        max_tokens: updatedAgent.max_tokens,
      });
    }

    setSaveStatus('saved');
    setShowSaved(true);
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => {
      setShowSaved(false);
      setSaveStatus('idle');
    }, 2000);
  }, []);

  const handleSettingsSaveError = useCallback(() => {
    setShowSaved(false);
    setSaveStatus('error');
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
  }, []);

  const handleSaveBusyChange = useCallback((busy: boolean) => {
    setIsSettingsSaving(busy);
    if (busy) {
      setSaveStatus('saving');
    }
  }, []);

  useEffect(() => {
    return () => {
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
      streamRequestIdRef.current += 1;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // Latest assistant message with sources drives the Retrieved Context panel.
  const lastSources: Source[] = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.sources && msg.sources.length > 0) {
        return msg.sources;
      }
    }
    return [];
  })();

  if (isMobile) {
    return (
      <AdminLayout>
        <div style={{
          height: 'calc(100vh - 60px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            flexShrink: 0,
          }}>
            {(['preview', 'settings'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`chip ${activeTab === tab ? 'chip-active' : ''}`}
              >
                {tab === 'settings' ? t('navigation.aiSettings') : t('playground.preview')}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'settings' ? (
              <div style={{ height: '100%', overflow: 'auto' }}>
                <div className="liquid-glass-card" style={{ padding: 'var(--space-4)', margin: '0 var(--space-3)' }}>
                  <RetrievedContext sources={lastSources} />
                </div>
                <AISettingsForm agentId={agentId || undefined} compact onSave={handleSettingsSave} onSaveError={handleSettingsSaveError} onChatParamsChange={setChatParams} onSaveBusyChange={handleSaveBusyChange} />
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: '0 var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', overflow: 'hidden' }}>
                <ChatPanel
                  messages={messages}
                  input={input}
                  isLoading={isLoading}
                  isSettingsSaving={isSettingsSaving}
                  agent={agent}
                  onInputChange={handleInputChange}
                  onSendMessage={handleSendMessage}
                  onClearChat={handleClearChat}
                />
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{
        height: '100vh',
        display: 'flex',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        maxWidth: '1440px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}>
        {/* Left column — chat-style interaction tester */}
        <section
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-accent-primary)' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {t('labels.testInteraction')}
            </h2>
            {agent && (
              <span className="badge badge-neutral">{agent.name}</span>
            )}
          </div>
          <ChatPanel
            messages={messages}
            input={input}
            isLoading={isLoading}
            isSettingsSaving={isSettingsSaving}
            agent={agent}
            onInputChange={handleInputChange}
            onSendMessage={handleSendMessage}
            onClearChat={handleClearChat}
          />
        </section>

        {/* Right column — Inspector panel */}
        <aside
          style={{
            width: '400px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-outline)' }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {t('labels.inspector')}
            </h2>
            {/* Save status indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color:
                saveStatus === 'saving'
                  ? 'var(--color-text-muted)'
                  : saveStatus === 'saved'
                    ? 'var(--color-success)'
                    : saveStatus === 'error'
                      ? 'var(--color-error)'
                      : 'var(--color-text-muted)',
            }}>
              {saveStatus === 'saving' && (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                  <span>{t('status.saving')}</span>
                </>
              )}
              {saveStatus === 'saved' && showSaved && (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{t('status.saved')}</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span>{t('status.error')}</span>
                </>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Retrieved Context */}
            {lastSources.length > 0 ? (
              <RetrievedContext sources={lastSources} />
            ) : (
              !isSettingsSaving && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {t('labels.noContextYet')}
                </p>
              )
            )}

            {/* Model Settings + System Prompt — composed from the real settings form */}
            <AISettingsForm
              agentId={agentId || undefined}
              compact
              onSave={handleSettingsSave}
              onSaveError={handleSettingsSaveError}
              onChatParamsChange={setChatParams}
              onSaveBusyChange={handleSaveBusyChange}
            />
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
