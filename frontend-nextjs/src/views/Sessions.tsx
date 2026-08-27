'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AdminLayout from '../components/AdminLayout'
import HelpTooltip from '../components/HelpTooltip'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { useIsMobile, useMediaQuery } from '../hooks/useMediaQuery'
import { WS_BASE_URL } from '../lib/env'
import { formatAssistantMessageContent } from '../utils/citations'

interface Session {
  id: string
  session_id: string
  visitor_id?: string
  visitor_country?: string
  visitor_city?: string
  status: string
  message_count: number
  created_at: string
  updated_at?: string
  last_message?: string
}

interface Message {
  id: number
  role: string
  content: string
  sources?: Array<{
    type: 'url' | 'file'
    title?: string
    url?: string
    snippet?: string
    question?: string
    id?: string
  }>
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('common')
  if (status === 'active') {
    return (
      <span className="badge badge-info">
        <span className="badge-dot" />
        {t('sessions.aiHandledBadge')}
      </span>
    )
  }
  if (status === 'taken_over') {
    return (
      <span className="badge badge-warning">
        <span className="badge-dot" />
        {t('sessions.humanTakenOverBadge')}
      </span>
    )
  }
  return <span className="badge badge-neutral">{t('status.ended')}</span>
}

function stripMarkdown(text: string): string {
  return text
    .replace(/[*_`#\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function Sessions() {
  const { t } = useTranslation('common')
  const { agentId } = useParams<{ agentId?: string }>()
  const { token } = useAuth()
  const isMobile = useIsMobile()
  const isWide = useMediaQuery('(min-width: 1281px)')
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'taken_over' | 'closed'>('all')
  const [keyword, setKeyword] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptRef = useRef(0)
  const isMountedRef = useRef(true)
  const selectedSessionRef = useRef<Session | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const fetchMessages = useCallback(async (sessionId: string) => {
    if (!token) return

    try {
      const response = await fetch(`/api/v1/admin/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }, [token])

  const fetchSessions = useCallback(async () => {
    if (!token) return

    setLoading(true)
    try {
      const statusParam = filter === 'all' ? '' : `&status=${filter}`
      const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''

      const response = await fetch(
        `/api/v1/admin/sessions?skip=0&limit=50${agentId ? `&agent_id=${agentId}` : ''}${statusParam}${keywordParam}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (response.ok) {
        const data = await response.json()
        setSessions(data.items || [])
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }, [filter, keyword, token])

  const connectWebSocket = useCallback(() => {
    if (!token) return

    const wsBaseUrl = WS_BASE_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    const wsUrl = `${wsBaseUrl}/api/v1/ws/admin?token=${token}${agentId ? `&agent_id=${agentId}` : ''}`

    try {
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        reconnectAttemptRef.current = 0
        console.log('WebSocket connected')
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'session_update' || data.type === 'new_message') {
            void fetchSessions()
            const currentSession = selectedSessionRef.current
            const matchedSessionId = data.sessionDbId || data.sessionId
            if (currentSession && matchedSessionId === currentSession.id) {
              void fetchMessages(currentSession.id)
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      wsRef.current.onerror = () => {
        console.log('WebSocket connection error')
      }

      wsRef.current.onclose = (event) => {
        // Do not reconnect after intentional close (logout, unmount cleanup).
        if (!isMountedRef.current) return
        // Normal closure (1000) or policy close (1001) should not trigger reconnect.
        if (event.code === 1000 || event.code === 1001) return

        const delay = Math.min(30000, 1000 * (2 ** reconnectAttemptRef.current))
        reconnectAttemptRef.current += 1
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay)
      }
    } catch {
      console.log('WebSocket not available')
    }
  }, [fetchMessages, fetchSessions, token])

  useEffect(() => {
    isMountedRef.current = true
    void fetchSessions()

    return () => {
      isMountedRef.current = false
    }
  }, [fetchSessions])

  useEffect(() => {
    if (!token) return

    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [connectWebSocket, token])

  useEffect(() => {
    if (selectedSession) {
      void fetchMessages(selectedSession.id)
    }
    selectedSessionRef.current = selectedSession
  }, [fetchMessages, selectedSession])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleTakeover = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/v1/admin/sessions/${sessionId}/takeover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        console.error('Failed to takeover session:', response.statusText)
        alert(t('errors.takeoverFailed'))
        return
      }

      await fetchSessions()
      if (selectedSession && selectedSession.id === sessionId) {
        setSelectedSession({ ...selectedSession, status: 'taken_over' })
      }
    } catch (error) {
      console.error('Failed to takeover session:', error)
      alert(t('errors.takeoverFailed'))
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedSession) return

    setSendingMessage(true)
    try {
      const response = await fetch('/api/v1/admin/sessions/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: selectedSession.id,
          content: inputValue,
        }),
      })

      if (!response.ok) {
        console.error('Failed to send message:', response.statusText)
        alert(t('errors.sendFailed'))
        return
      }

      setInputValue('')
      await fetchMessages(selectedSession.id)
    } catch (error) {
      console.error('Failed to send message:', error)
      alert(t('errors.sendFailed'))
    } finally {
      setSendingMessage(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Articles shared in this conversation — derived honestly from real per-message sources.
  const sharedArticles = (() => {
    const seen = new Set<string>()
    const items: Array<{ key: string; title: string; url?: string }> = []
    for (const msg of messages) {
      for (const source of msg.sources ?? []) {
        const title = source.title || source.question
        if (!title) continue
        const dedupeKey = source.url || `${source.id ?? ''}-${title}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        items.push({ key: dedupeKey, title, url: source.url })
      }
    }
    return items.slice(0, 6)
  })()

  const canCompose = selectedSession?.status === 'taken_over'

  /* ---- Session list card ---- */
  const renderSessionCard = (session: Session) => {
    const selected = selectedSession?.id === session.id
    return (
      <div
        key={session.id}
        onClick={() => setSelectedSession(session)}
        style={{
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          background: selected ? 'var(--color-accent-soft)' : 'transparent',
          border: selected ? '1px solid rgba(67,67,213,0.25)' : '1px solid transparent',
          cursor: 'pointer',
          transition: 'background var(--transition-fast)',
          display: 'flex',
          gap: 'var(--space-3)',
          position: 'relative',
        }}
      >
        {selected && (
          <span
            style={{
              position: 'absolute',
              left: '-6px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '3px',
              height: '28px',
              background: 'var(--color-accent-primary)',
              borderRadius: '0 2px 2px 0',
            }}
          />
        )}
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            flexShrink: 0,
          }}
        >
          {(session.visitor_id || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: '2px' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('settings.sessionWithId', { id: session.session_id })}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0 }}>
              {formatTime(session.updated_at || session.created_at)}
            </span>
          </div>
          {session.last_message && (
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: '0 0 var(--space-2)',
              }}
            >
              {stripMarkdown(session.last_message)}
            </p>
          )}
          <StatusBadge status={session.status} />
        </div>
      </div>
    )
  }

  /* ---- Context panel (real fields only) ---- */
  const renderContextPanel = () => {
    if (!selectedSession) return null
    const locationParts = [selectedSession.visitor_city, selectedSession.visitor_country].filter(Boolean)

    return (
      <aside
        style={{
          width: '280px',
          flexShrink: 0,
          background: 'var(--color-bg-secondary)',
          borderLeft: '1px solid var(--color-border)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
          <h3
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-4)',
            }}
          >
            {t('sessions.visitorDetails')}
          </h3>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginBottom: '2px' }}>{t('sessions.visitorIdLabel')}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)', margin: 0 }}>
                {selectedSession.visitor_id || '—'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginBottom: '2px' }}>{t('sessions.location')}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {locationParts.length > 0 ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {locationParts.join(', ')}
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginBottom: '2px' }}>{t('sessions.statusLabel')}</p>
              <StatusBadge status={selectedSession.status} />
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginBottom: '2px' }}>{t('sessions.messagesLabel')}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
                {selectedSession.message_count}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginBottom: '2px' }}>{t('sessions.startedLabel')}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
                {formatTime(selectedSession.created_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Recent articles shared in this conversation */}
        {sharedArticles.length > 0 && (
          <div style={{ padding: 'var(--space-5)' }}>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {t('sessions.recentArticles')}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
              {sharedArticles.map((article) => (
                <li key={article.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: 'var(--color-accent-primary)', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </span>
                  {article.url ? (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '12px',
                        lineHeight: 1.5,
                        color: 'var(--color-text-secondary)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {article.title}
                    </a>
                  ) : (
                    <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{article.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    )
  }

  return (
    <AdminLayout>
      <div style={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        overflow: 'hidden',
      }}>
        {/* Session list pane */}
        <div style={{
          width: isMobile ? '100%' : '360px',
          height: isMobile ? (selectedSession ? '0' : '100%') : 'auto',
          overflow: isMobile && selectedSession ? 'hidden' : 'auto',
          borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
          borderBottom: isMobile ? '1px solid var(--color-border)' : 'none',
          display: isMobile && selectedSession ? 'none' : 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-secondary)',
          flexShrink: 0,
        }}>
          <div style={{
            padding: 'var(--space-5)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <h1 style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {t('settings.chatCenter')}
              <HelpTooltip
                title={t('settings.chatCenter')}
                content={[
                  t('settings.chatCenterDesc'),
                  t('settings.activeDesc'),
                  t('settings.takenOverDesc'),
                  t('settings.endedDesc'),
                  t('settings.searchSupport')
                ]}
                position="right"
                size="sm"
              />
            </h1>

            {/* Filter chips — mapped to real statuses: active→AI Handling, taken_over→Needs Human, closed */}
            <div style={{
              display: 'flex',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-3)',
              flexWrap: 'wrap',
            }}>
              {(['all', 'active', 'taken_over', 'closed'] as const).map((status) => {
                const label = status === 'all'
                  ? t('status.all')
                  : status === 'active'
                    ? t('sessions.aiHandlingChip')
                    : status === 'taken_over'
                      ? t('sessions.needsHumanChip')
                      : t('status.ended');
                return (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`chip ${filter === status ? 'chip-active' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={t('placeholders.searchPlaceholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{
                  paddingLeft: 'var(--space-8)',
                  fontSize: 'var(--text-sm)',
                }}
              />
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  position: 'absolute',
                  left: 'var(--space-2)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-2)',
          }}>
            {loading && sessions.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
                <div className="skeleton" style={{ height: '72px' }} />
                <div className="skeleton" style={{ height: '72px' }} />
                <div className="skeleton" style={{ height: '72px' }} />
              </div>
            ) : sessions.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: 'var(--space-10)',
                color: 'var(--color-text-muted)',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto var(--space-3)', opacity: 0.4 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: 'var(--text-sm)' }}>{t('labels.noData')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {sessions.map(renderSessionCard)}
              </div>
            )}
          </div>
        </div>

        {/* Conversation pane */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-primary)',
          minWidth: 0,
        }}>
          {selectedSession ? (
            <>
              {/* Detail header */}
              <div style={{
                height: '64px',
                padding: '0 var(--space-5)',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
                  {isMobile && (
                    <button
                      onClick={() => setSelectedSession(null)}
                      aria-label={t('sessions.backToList')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                        padding: 'var(--space-2)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {t('settings.visitorWithId', { id: selectedSession.visitor_id })}
                    </h2>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-muted)',
                    }}>
                      {(selectedSession.visitor_country || selectedSession.visitor_city) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <span className="status-dot status-dot-active" style={{ width: '6px', height: '6px' }} />
                          {selectedSession.visitor_city || selectedSession.visitor_country}
                        </span>
                      )}
                      <StatusBadge status={selectedSession.status} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0, alignItems: 'center' }}>
                  {selectedSession.status === 'active' && (
                    <button
                      onClick={() => handleTakeover(selectedSession.id)}
                      className="btn-secondary"
                      style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-4)' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 11V6a2 2 0 0 0-4 0v5" />
                        <path d="M14 10V4a2 2 0 0 0-4 0v2" />
                        <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
                        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                      </svg>
                      {!isMobile && t('sessions.takeOver')}
                    </button>
                  )}
                  {!isMobile && (
                    <button
                      onClick={() => setSelectedSession(null)}
                      aria-label={t('buttons.cancel')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        padding: 'var(--space-2)',
                        borderRadius: 'var(--radius-full)',
                        display: 'flex',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Takeover banner */}
              {selectedSession.status === 'taken_over' && (
                <div style={{
                  background: 'rgba(67, 67, 213, 0.08)',
                  borderBottom: '1px solid rgba(67, 67, 213, 0.25)',
                  padding: 'var(--space-2) var(--space-5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  color: 'var(--color-accent-primary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  {t('sessions.takeoverBanner')}
                </div>
              )}

              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 'var(--space-5)',
              }}>
                {messages.length === 0 ? (
                  <div style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                  }}>
                    <div style={{
                      width: '72px',
                      height: '72px',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: 'var(--radius-xl)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 'var(--space-4)',
                      border: '1px solid var(--color-border)',
                    }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)' }}>{t('labels.noMessages')}</p>
                  </div>
                ) : (
                  <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                    {messages.map((msg) => {
                      const formattedAssistantContent = msg.role === 'user'
                        ? null
                        : formatAssistantMessageContent(msg.content, msg.sources ?? [])

                      const isVisitor = msg.role === 'user'
                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: 'flex',
                            justifyContent: isVisitor ? 'flex-start' : 'flex-end',
                          }}
                        >
                          <div style={{
                            maxWidth: '75%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            alignItems: isVisitor ? 'flex-start' : 'flex-end',
                          }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 var(--space-1)' }}>
                              {isVisitor ? t('roles.visitor') : t('roles.agent')} · {formatTime(msg.created_at)}
                            </span>
                            <div style={{
                              padding: 'var(--space-3) var(--space-4)',
                              borderRadius: isVisitor ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                              background: isVisitor
                                ? 'var(--color-bg-secondary)'
                                : 'var(--color-primary-container)',
                              border: isVisitor ? '1px solid var(--color-border)' : 'none',
                              color: isVisitor ? 'var(--color-text-primary)' : '#faf7ff',
                            }}>
                              <div style={{
                                fontSize: 'var(--text-sm)',
                                lineHeight: 1.65,
                                wordBreak: 'break-word',
                                whiteSpace: isVisitor ? 'pre-wrap' : undefined,
                              }}>
                                {isVisitor ? msg.content : (
                                  <>
                                    <MarkdownRenderer content={formattedAssistantContent?.content ?? msg.content} />
                                    {formattedAssistantContent && formattedAssistantContent.references.length > 0 && (
                                      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid rgba(255,255,255,0.25)' }}>
                                        <div style={{ fontSize: 'var(--text-xs)', opacity: 0.85, marginBottom: 'var(--space-2)', fontWeight: 600 }}>
                                          {t('citations.references')}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                                          {formattedAssistantContent.references.map((reference) => (
                                            <a
                                              key={reference.url}
                                              href={reference.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{ color: 'inherit', textDecoration: 'underline', fontSize: 'var(--text-xs)', fontWeight: 500, wordBreak: 'break-word' }}
                                            >
                                              {reference.title}
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Composer — gated on real session status */}
              {selectedSession.status !== 'closed' && (
                <div style={{
                  padding: 'var(--space-4) var(--space-5)',
                  borderTop: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                }}>
                  <div style={{ maxWidth: '860px', margin: '0 auto' }}>
                    <div style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      alignItems: 'stretch',
                      opacity: canCompose ? 1 : 0.6,
                    }}>
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && canCompose && handleSend()}
                        placeholder={canCompose ? t('placeholders.enterMessage') : t('sessions.aiHandlingNotice')}
                        disabled={!canCompose || sendingMessage}
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={handleSend}
                        disabled={!canCompose || sendingMessage || !inputValue.trim()}
                        className="btn-primary"
                        style={{ flexShrink: 0 }}
                      >
                        {sendingMessage ? (
                          <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} />
                        ) : (
                          <>
                            {t('buttons.send')}
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="22" y1="2" x2="11" y2="13" />
                              <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>
                    <p style={{
                      textAlign: 'center',
                      fontSize: '11px',
                      marginTop: 'var(--space-2)',
                      color: canCompose ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                    }}>
                      {canCompose ? t('sessions.humanControlNotice') : t('sessions.aiHandlingNotice')}
                    </p>
                  </div>
                </div>
              )}

              {/* Empty-state composer note for closed sessions */}
              {selectedSession.status === 'closed' && (
                <div style={{
                  padding: 'var(--space-3) var(--space-5)',
                  borderTop: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  textAlign: 'center',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                }}>
                  {t('sessions.closedNotice')}
                </div>
              )}
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              padding: 'var(--space-10)',
            }}>
              <div style={{
                width: '96px',
                height: '96px',
                background: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--radius-xl)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 'var(--space-5)',
                border: '1px solid var(--color-border)',
              }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.45 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 style={{
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-1)',
              }}>
                {t('labels.selectSession')}
              </h3>
              <p style={{
                fontSize: 'var(--text-sm)',
                textAlign: 'center',
                maxWidth: '300px',
              }}>
                {t('labels.selectSessionDesc')}
              </p>
            </div>
          )}
        </div>

        {/* Context panel — desktop only */}
        {!isMobile && isWide && renderContextPanel()}
      </div>
    </AdminLayout>
  )
}
