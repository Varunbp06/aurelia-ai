'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api } from '../services/api'
import type { URLSource, Agent } from '../services/api';
import AdminLayout from '../components/AdminLayout';
import HelpTooltip from '../components/HelpTooltip';
import KBSetupGuard from '../components/KBSetupGuard';
import { useIsMobile, useIsTablet } from '../hooks/useMediaQuery';
import SourcesSummary from '../components/SourcesSummary';

const PAGE_SIZE = 20;

interface TaskStatus {
  is_crawling: boolean;
  is_rebuilding: boolean;
  can_modify_index: boolean;
  active_tasks: string[];
}

export default function URLManagement() {
  const { t } = useTranslation('common');
  const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [urls, setUrls] = useState<URLSource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [refetching, setRefetching] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(false);
  const [fetchIntervalDays, setFetchIntervalDays] = useState(7);
  const [crawlMaxDepth, setCrawlMaxDepth] = useState(2);
  const [crawlMaxPages, setCrawlMaxPages] = useState(20);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [crawlPolling, setCrawlPolling] = useState(false);
  const [crawlStartCount, setCrawlStartCount] = useState(0);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [, _setRefreshTrigger] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const [deletingUrlId, setDeletingUrlId] = useState<number | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const taskStatusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(false);
  const stopPollingRequestedRef = useRef(false);
  // Auto-complete URL with https:// if missing protocol
  const normalizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const handleUrlBlur = () => {
    if (newUrl.trim() && !/^https?:\/\//i.test(newUrl.trim())) {
      setNewUrl(normalizeUrl(newUrl));
    }
  };

  useEffect(() => {
    loadDefaultAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeAgentId]);

  const loadDefaultAgent = async () => {
    try {
      if (!routeAgentId) return;
      const data = await api.getAgent(routeAgentId);
      setAgent(data);
      setAgentId(data.id);
      setAutoFetchEnabled(data.enable_auto_fetch || false);
      setFetchIntervalDays(data.url_fetch_interval_days || 7);
      setCrawlMaxDepth(data.crawl_max_depth ?? 2);
      setCrawlMaxPages(data.crawl_max_pages ?? 20);
    } catch (error) {
      alert(`${t('labels.urlManagement.loadAgentFailed')}: ${error instanceof Error ? error.message : t('errors.unknown')}`);
    }
  };

  const loadURLs = useCallback(async (targetPage?: number) => {
    if (!agentId) return;
    const effectivePage = targetPage ?? page;
    setLoading(true);
    try {
      const data = await api.listURLs(
        agentId,
        (effectivePage - 1) * PAGE_SIZE,
        PAGE_SIZE,
      );
      setUrls(data.urls);
      setTotal(data.total);

      const hasPendingOrFetching = data.urls.some(
        (url) => url.status === 'pending' || url.status === 'fetching'
      );
      // 只有 pending/fetching 的 URL 才启动轮询
      if (hasPendingOrFetching && !crawlPollingRef.current && !stopPollingRequestedRef.current) {
        setCrawlStartCount(data.total);
        setCrawlPolling(true);
      }
    } catch (error) {
      alert(`${t('labels.urlManagement.loadFailed')}: ${error instanceof Error ? error.message : t('errors.unknown')}`);
    } finally {
      setLoading(false);
    }
  }, [agentId, page, t]);

  const goToPage = useCallback((nextPage: number) => {
    setPage(nextPage);
    void loadURLs(nextPage);
  }, [loadURLs]);

  // Stable refs for functions used inside interval callbacks.
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const pageRef = useRef(page);
  pageRef.current = page;
  const crawlPollingRef = useRef(crawlPolling);
  crawlPollingRef.current = crawlPolling;
  const loadURLsRef = useRef(loadURLs);
  loadURLsRef.current = loadURLs;

  useEffect(() => {
    isMountedRef.current = true;
    if (agentId) {
      void loadURLsRef.current();
      const pollTaskStatus = async () => {
        if (!isMountedRef.current || !agentIdRef.current) return;
        try {
          const status = await api.getTasksStatus(agentIdRef.current);
          if (!isMountedRef.current) return;
          setTaskStatus(prev => {
            if (
              prev &&
              prev.is_crawling === status.is_crawling &&
              prev.is_rebuilding === status.is_rebuilding &&
              prev.can_modify_index === status.can_modify_index &&
              prev.active_tasks.length === status.active_tasks.length &&
              prev.active_tasks.every((task, index) => task === status.active_tasks[index])
            ) {
              return prev;
            }
            return status;
          });
          if (status.is_crawling && !crawlPollingRef.current && !stopPollingRequestedRef.current) {
            setCrawlPolling(true);
          }
          // Note: Don't immediately stop URL polling when is_crawling becomes false.
          // The URL polling loop has its own stop conditions that ensure at least
          // one more poll cycle runs after crawl completes, so newly created URLs
          // (including error records) are picked up before stopping.
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (error instanceof TypeError && String(error.message).includes('Failed to fetch') && !isMountedRef.current) return;
          console.error('Failed to poll task status:', error);
        }
      };
      void pollTaskStatus();
      taskStatusIntervalRef.current = setInterval(pollTaskStatus, 3000);
    }
    return () => {
      isMountedRef.current = false;
      if (taskStatusIntervalRef.current) {
        clearInterval(taskStatusIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const handleAddURL = async () => {
    if (!agentId) return;
    if (!newUrl.trim()) {
      alert(t('labels.urlManagement.enterUrl'));
      return;
    }

    stopPollingRequestedRef.current = false;
    setAdding(true);
    try {
      const result = await api.createURLs(agentId, [newUrl]);
      const createdCount = result.urls.length;
      alert(t('labels.urlManagement.addedCount', { count: createdCount }));

      // Start crawl polling if auto-fetch was queued
      if (result.auto_fetch_queued && result.job_id) {
        setCrawlPolling(true);
      }

      setNewUrl('');
      await loadURLs(1);
      setPage(1);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('Invalid URL')) {
        alert(t('labels.urlManagement.invalidUrl'));
      } else {
        alert(`${t('labels.urlManagement.addFailed')}: ${errMsg || t('errors.unknown')}`);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRefetch = async () => {
    if (!agentId) return;
    if (!confirm(t('labels.urlManagement.confirmRefetch'))) return;

    stopPollingRequestedRef.current = false;
    setRefetching(true);
    try {
      const result = await api.refetchURLs(agentId, undefined, true);
      setCrawlStartCount(total);
      setCrawlPolling(true);
      await loadURLs();
      alert(t('labels.urlManagement.refetchStarted', { jobId: result.job_id }));
    } catch (error) {
      alert(`${t('labels.urlManagement.refetchFailed')}: ${error instanceof Error ? error.message : t('errors.unknown')}`);
    } finally {
      setRefetching(false);
    }
  };

  const stopPolling = useCallback(async () => {
    stopPollingRequestedRef.current = true;
    try {
      if (agentId) {
        await api.cancelURLTasks(agentId);
      }
    } catch (error) {
      console.error('Failed to cancel URL tasks:', error);
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setCrawlPolling(false);
    setPollingStopped(true);
    window.setTimeout(() => setPollingStopped(false), 2000);
  }, [agentId]);

  // Polling effect for crawl progress
  useEffect(() => {
    if (!crawlPolling || !agentId) return;

    let pollCount = 0;
    let lastUrlCount = crawlStartCount;
    let consecutiveNoChange = 0; // 连续无变化次数

    const pollURLs = async () => {
      pollCount++;

      try {
        // 同时查询 URL 列表、任务状态和索引状态
        const currentPage = pageRef.current;
        const [data, tasksStatus, indexStatus] = await Promise.all([
          api.listURLs(agentId, (currentPage - 1) * PAGE_SIZE, PAGE_SIZE),
          api.getTasksStatus(agentId),
          api.getIndexStatus(agentId).catch(() => null) // 优雅降级，如果 API 不存在
        ]);

        // 更新 URL 列表
        setUrls(data.urls);
        setTotal(data.total);

        // 检查是否有新 URL 被添加
        const newUrlsAdded = data.total > lastUrlCount;
        if (newUrlsAdded) {
          lastUrlCount = data.total;
          consecutiveNoChange = 0;
        } else {
          consecutiveNoChange++;
        }

        // 计算索引相关状态
        const hasPendingOrFetching = data.urls.some(
          (url) => url.status === 'pending' || url.status === 'fetching'
        );
        // Backend index status: idle, indexing, rebuilding
        const isBackendIndexing = indexStatus !== null &&
          (indexStatus.status === 'indexing' || indexStatus.status === 'rebuilding');

        // 停止条件（必须全部满足）：
        // 1. 没有 pending/fetching 的 URL
        // 2. 后端报告没有正在进行的抓取任务 (is_crawling = false)
        // 3. 没有正在重建索引 (is_rebuilding = false)
        // 4. 没有正在处理的索引任务 (backend status is not indexing/rebuilding)
        // 5. 已经轮询了至少 3 次
        // 6. 连续 2 次没有新 URL 增加（确保数据已稳定）
        const shouldStop =
          !hasPendingOrFetching &&
          !tasksStatus.is_crawling &&
          !tasksStatus.is_rebuilding &&
          !isBackendIndexing &&
          pollCount > 3 &&
          consecutiveNoChange >= 1;

        if (shouldStop) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setCrawlPolling(false);
          // 轮询停止后，最后刷新一次 URL 列表
          await loadURLsRef.current();
          return;
        }

        // 备选停止条件：如果轮询超过 30 次仍没有变化，可能是抓取失败
        if (consecutiveNoChange > 30 && !tasksStatus.is_crawling && !tasksStatus.is_rebuilding && !isBackendIndexing) {
          await stopPolling();
        }
      } catch (error) {
        console.error('[pollURLs] Polling error:', error);
      }
    };

    // Initial poll - 立即执行第一次
    void pollURLs();

    // Set up interval
    pollingIntervalRef.current = setInterval(() => {
      void pollURLs();
    }, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlPolling, agentId, crawlStartCount, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleCrawlSite = async () => {
    if (!agentId) {
      return;
    }
    if (!newUrl.trim()) {
      alert(t('labels.urlManagement.enterUrl'));
      return;
    }

    const normalizedUrl = normalizeUrl(newUrl);

    stopPollingRequestedRef.current = false;
    setCrawling(true);
    setCrawlStartCount(total);
    try {
      await api.crawlSite(agentId, normalizedUrl, crawlMaxDepth, crawlMaxPages);
      setNewUrl('');
      setCrawlPolling(true);
    } catch (error) {
      console.error('Crawl API error:', error);
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('Invalid URL')) {
        alert(t('labels.urlManagement.invalidUrl'));
      } else {
        alert(`${t('labels.urlManagement.crawlFailed')}: ${errMsg || t('errors.unknown')}`);
      }
    } finally {
      setCrawling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; label: string }> = {
      success: { className: 'badge badge-success', label: t('status.successBadge') },
      failed: { className: 'badge badge-error', label: t('status.failed') },
      fetching: { className: 'badge badge-warning badge-pulse', label: t('status.fetching') },
      pending: { className: 'badge badge-warning', label: t('status.pending') },
    };
    return styles[status] || { className: 'badge', label: status };
  };

  const getIndexStatusBadge = (url: URLSource): { className: string; label: string; showRebuild: boolean } | null => {
    if (url.status !== 'success') {
      return null;
    }

    switch (url.indexing_status) {
      case 'ready':
        return { className: 'badge badge-success', label: t('status.indexedBadge'), showRebuild: false };
      case 'processing':
        return { className: 'badge badge-info badge-pulse', label: t('status.processingBadge'), showRebuild: false };
      case 'error':
        return { className: 'badge badge-error', label: t('status.indexErrorBadge'), showRebuild: true };
      case 'pending':
      default:
        if (url.is_indexed) {
          return { className: 'badge badge-success', label: t('status.indexedBadge'), showRebuild: false };
        }
        return { className: 'badge badge-warning', label: t('status.notIndexedBadge'), showRebuild: true };
    }
  };

  const handleRebuildIndex = async () => {
    if (!agentId) return;
    try {
      await api.rebuildIndex(agentId);
      // Poll for status updates
      setTimeout(() => loadURLs(), 1000);
    } catch (error) {
      console.error('Failed to rebuild index:', error);
    }
  };

  const handleDelete = async (urlId: number) => {
    if (!agentId) return;
    if (!confirm(t('labels.urlManagement.confirmDelete'))) return;

    setDeletingUrlId(urlId);
    try {
      await api.deleteURL(agentId, urlId);
      await loadURLs();
    } catch (error) {
      alert(`${t('labels.urlManagement.deleteFailed')}: ${error instanceof Error ? error.message : t('errors.unknown')}`);
    } finally {
      setDeletingUrlId(null);
    }
  };

  const handleClearAll = () => {
    if (!agentId) return;
    if (urls.length === 0 && total === 0) return;
    setShowClearConfirm(true);
  };

  const confirmClearAll = async () => {
    if (!agentId) return;

    setClearing(true);
    try {
      const result = await api.clearAllUrls(agentId);
      setShowClearConfirm(false);
      setPage(1);
      await loadURLs(1);
      alert(t('labels.urlManagement.clearSuccess', { count: result.deleted_count }));
    } catch (error) {
      alert(`${t('labels.urlManagement.clearFailed')}: ${error instanceof Error ? error.message : t('errors.unknown')}`);
    } finally {
      setClearing(false);
    }
  };

  const handleSaveAutoFetchSettings = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      await api.updateAgent(agent.id, {
        enable_auto_fetch: autoFetchEnabled,
        url_fetch_interval_days: fetchIntervalDays,
        crawl_max_depth: crawlMaxDepth,
        crawl_max_pages: crawlMaxPages,
      });
      alert(t('labels.urlManagement.autoFetchSaved'));
    } catch (error) {
      alert(`${t('errors.saveFailed')}: ${error instanceof Error ? error.message : t('errors.unknown')}`);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const failedWithErrors = urls.filter(u => u.status === 'failed' && u.last_error);

  /* ---- Status pill pair ---- */
  const renderStatusCell = (url: URLSource) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <span className={getStatusBadge(url.status).className}>
        <span className="badge-dot" />
        {getStatusBadge(url.status).label}
      </span>
      {getIndexStatusBadge(url) && (
        <span className={getIndexStatusBadge(url)!.className}>
          {getIndexStatusBadge(url)!.label}
        </span>
      )}
    </div>
  );

  /* ---- Mobile card ---- */
  const renderMobileCard = (url: URLSource) => (
    <div key={url.id} style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <a href={url.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, fontSize: 'var(--text-sm)', wordBreak: 'break-all' }}>
          {url.url}
        </a>
        <button
          onClick={() => handleDelete(url.id)}
          disabled={deletingUrlId === url.id}
          aria-label={t('buttons.delete')}
          style={{ background: 'transparent', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '2px', display: 'flex' }}
        >
          {deletingUrlId === url.id ? (
            <div className="spinner" style={{ width: '14px', height: '14px' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          )}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {renderStatusCell(url)}
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {url.last_fetch_at ? `${t('labels.urlManagement.lastFetch')}: ${new Date(url.last_fetch_at).toLocaleDateString()}` : ''}
        </span>
      </div>
      {(url.status === 'success' && !url.is_indexed && url.indexing_error) && (
        <p style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: 'var(--color-error)', background: 'rgba(186,26,26,0.06)', borderLeft: '2px solid var(--color-error)', padding: '2px 8px', borderRadius: '4px' }}>{url.indexing_error}</p>
      )}
      {(url.status === 'failed' && url.last_error) && (
        <p style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: 'var(--color-error)', background: 'rgba(186,26,26,0.06)', borderLeft: '2px solid var(--color-error)', padding: '2px 8px', borderRadius: '4px' }}>{url.last_error}</p>
      )}
    </div>
  );

  return (
    <AdminLayout>
      {agentId ? (
        <KBSetupGuard agentId={agentId}>
          {showClearConfirm && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(30, 27, 23, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-4)',
                zIndex: 1000,
              }}
            >
              <div
                className="glass-modal"
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  padding: 'var(--space-6)',
                }}
              >
                <h3 style={{ margin: 0, marginBottom: 'var(--space-3)', fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>
                  {t('labels.urlManagement.clearAll')}
                </h3>
                <p style={{ margin: 0, marginBottom: 'var(--space-5)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {t('labels.urlManagement.confirmClearAll')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowClearConfirm(false)} disabled={clearing}>
                    {t('buttons.cancel')}
                  </button>
                  <button type="button" className="btn-danger" onClick={confirmClearAll} disabled={clearing}>
                    {clearing ? t('labels.urlManagement.clearing') : t('buttons.confirm')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{
            padding: isMobile ? 'var(--space-4)' : 'var(--space-8)',
            maxWidth: '1200px',
            margin: '0 auto',
          }}>
            {/* Header */}
            <header style={{
              marginBottom: 'var(--space-6)',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}>
              <div>
                <h1 style={{
                  fontSize: isMobile ? 'var(--text-2xl)' : '28px',
                  lineHeight: '36px',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--color-text-primary)',
                  marginBottom: 'var(--space-1)',
                }}>
                  {t('labels.urlManagement.title')}
                </h1>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
                  {t('labels.urlManagement.description')}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: isMobile ? '100%' : 'auto' }}>
                <button
                  onClick={handleRefetch}
                  disabled={refetching}
                  className="btn-secondary"
                  style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}
                >
                  {refetching ? (
                    <div className="spinner" style={{ width: '14px', height: '14px' }} />
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  )}
                  {t('labels.bulkRetrain')}
                </button>
              </div>
            </header>

            {/* Add URL strip */}
            <section
              className="liquid-glass-card"
              style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}
            >
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 'var(--space-2)' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    placeholder={t('labels.urlManagement.urlPlaceholder')}
                    style={{ paddingLeft: 'var(--space-8)', paddingRight: 'var(--space-4)' }}
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
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-text-muted)',
                      pointerEvents: 'none',
                    }}
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <button
                  onClick={handleAddURL}
                  disabled={adding || !newUrl.trim()}
                  className="btn-primary"
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {adding ? (
                    <>
                      <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} />
                      {t('labels.urlManagement.adding')}
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      {t('labels.addUrl')}
                    </>
                  )}
                </button>
                <button
                  onClick={handleCrawlSite}
                  disabled={crawling || taskStatus?.is_crawling || !newUrl.trim()}
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {crawling ? (
                    <>
                      <div className="spinner" style={{ width: '14px', height: '14px' }} />
                      {t('labels.urlManagement.crawling')}
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      {t('labels.urlManagement.crawlSite')}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  className={`chip ${showSettings ? 'chip-active' : ''}`}
                  style={{ alignSelf: 'center', flexShrink: 0 }}
                >
                  {t('labels.crawlSettings')}
                </button>
              </div>

              {showSettings && (
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    paddingTop: 'var(--space-4)',
                    borderTop: '1px solid var(--color-border)',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--space-4)',
                  }}
                >
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-1)' }}>
                      {t('labels.urlManagement.crawlDepth')}
                      <HelpTooltip
                        title={t('labels.urlManagement.crawlDepth')}
                        content={[t('labels.urlManagement.crawlDepthDesc')]}
                        position="top"
                        size="sm"
                      />
                    </label>
                    <input
                      type="number"
                      value={crawlMaxDepth}
                      onChange={(e) => setCrawlMaxDepth(Math.max(1, Math.min(5, parseInt(e.target.value) || 2)))}
                      min={1}
                      max={5}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-1)' }}>
                      {t('labels.urlManagement.crawlMaxPages')}
                      <HelpTooltip
                        title={t('labels.urlManagement.crawlMaxPages')}
                        content={[t('labels.urlManagement.crawlMaxPagesDesc')]}
                        position="top"
                        size="sm"
                      />
                    </label>
                    <input
                      type="number"
                      value={crawlMaxPages}
                      onChange={(e) => setCrawlMaxPages(Math.max(1, Math.min(500, parseInt(e.target.value) || 20)))}
                      min={1}
                      max={500}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                      <span>{t('labels.urlManagement.autoFetch')}</span>
                      <HelpTooltip
                        title={t('labels.urlManagement.autoFetch')}
                        content={[
                          t('labels.urlManagement.autoFetchDescription'),
                          t('labels.urlManagement.enableAutoFetchHelpContent1'),
                          t('labels.urlManagement.enableAutoFetchHelpContent2'),
                          t('labels.urlManagement.enableAutoFetchHelpContent3'),
                        ]}
                        position="top"
                        size="sm"
                      />
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        onClick={() => setAutoFetchEnabled(!autoFetchEnabled)}
                        aria-checked={autoFetchEnabled}
                        role="switch"
                        style={{
                          width: '40px',
                          height: '22px',
                          minWidth: 0,
                          padding: 0,
                          borderRadius: '999px',
                          border: 'none',
                          background: autoFetchEnabled ? 'var(--color-accent-primary)' : 'var(--color-border-hover)',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: autoFetchEnabled ? '20px' : '2px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: 'white',
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                          }}
                        />
                      </button>
                      <input
                        type="number"
                        value={fetchIntervalDays}
                        onChange={(e) => setFetchIntervalDays(Math.max(1, parseInt(e.target.value) || 7))}
                        min={1}
                        max={30}
                        disabled={!autoFetchEnabled}
                        style={{ width: '72px' }}
                        aria-label={t('labels.urlManagement.fetchInterval')}
                      />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {t('labels.urlManagement.days')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={handleSaveAutoFetchSettings}
                      disabled={saving}
                      className="btn-primary"
                      style={{ width: '100%', fontSize: 'var(--text-xs)' }}
                    >
                      {saving ? (
                        <>
                          <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} />
                          {t('status.saving')}
                        </>
                      ) : (
                        t('labels.urlManagement.saveSettings')
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Crawl in-progress banner */}
            {(crawlPolling || taskStatus?.is_crawling) && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgba(67, 67, 213, 0.06)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                border: '1px solid rgba(67, 67, 213, 0.25)',
                fontSize: 'var(--text-sm)',
              }}>
                <div className="spinner" style={{ width: '15px', height: '15px' }} />
                <span style={{ fontWeight: 500, color: 'var(--color-accent-primary)' }}>
                  {t('labels.urlManagement.crawlInProgress')}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {t('labels.urlManagement.crawlDiscovered', { count: total - crawlStartCount })}
                </span>
                <button
                  onClick={stopPolling}
                  className="btn-ghost"
                  style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}
                >
                  {t('labels.urlManagement.stopPolling')}
                </button>
              </div>
            )}
            {pollingStopped && !crawlPolling && (
              <div style={{
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                color: 'var(--color-success)',
                fontSize: 'var(--text-xs)',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('labels.urlManagement.pollingStopped')}
              </div>
            )}

            {/* Crawl error banner */}
            {!crawlPolling && !taskStatus?.is_crawling && failedWithErrors.length > 0 && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgba(186, 26, 26, 0.05)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                border: '1px solid rgba(186, 26, 26, 0.25)',
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" style={{ marginTop: '2px', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'var(--color-error)', fontWeight: 500, fontSize: 'var(--text-xs)' }}>
                    {t('labels.urlManagement.crawlError') || 'Crawl errors occurred'}
                  </span>
                  <div style={{ marginTop: 'var(--space-1)' }}>
                    {failedWithErrors.slice(0, 3).map(u => (
                      <p key={u.id} style={{
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        margin: '2px 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {u.url}: {u.last_error}
                      </p>
                    ))}
                    {failedWithErrors.length > 3 && (
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        +{failedWithErrors.length - 3} more...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* URL table */}
            <section className="table-card">
              <div className="table-card-header">
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0 }}>
                  {t('labels.urlManagement.urlList')}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {total > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      disabled={clearing}
                      className="btn-ghost"
                      style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)', color: 'var(--color-error)' }}
                    >
                      {clearing ? (
                        <div className="spinner" style={{ width: '13px', height: '13px' }} />
                      ) : t('labels.urlManagement.clearAll')}
                    </button>
                  )}
                  <button
                    onClick={() => loadURLs()}
                    disabled={loading}
                    className="btn-ghost"
                    style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)' }}
                  >
                    {loading ? (
                      <div className="spinner" style={{ width: '13px', height: '13px' }} />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6M1 20v-6h6" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                    )}
                    {t('buttons.refresh')}
                  </button>
                </div>
              </div>

              {loading && urls.length === 0 ? (
                <div style={{ padding: 'var(--space-4)' }}>
                  <div className="skeleton skeleton-title" />
                  {[0, 1, 2].map(i => <div key={i} className="skeleton skeleton-text" />)}
                </div>
              ) : urls.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: 'var(--space-12) var(--space-6)',
                  color: 'var(--color-text-muted)',
                }}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto var(--space-3)', opacity: 0.4 }}>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{t('labels.urlManagement.noUrls')}</p>
                  <p style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>{t('labels.urlManagement.pleaseAddUrl')}</p>
                </div>
              ) : isMobile ? (
                <div>{urls.map(renderMobileCard)}</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="au-table" style={{ minWidth: '720px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40%', whiteSpace: 'nowrap' }}>{t('labels.urlManagement.webpageUrl')}</th>
                        <th style={{ width: '22%', whiteSpace: 'nowrap' }}>{t('users.status')}</th>
                        <th style={{ width: '22%', whiteSpace: 'nowrap' }}>{t('labels.urlManagement.lastFetch')}</th>
                        <th style={{ width: '16%', textAlign: 'right', whiteSpace: 'nowrap' }}>{t('users.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {urls.map((url) => (
                        <tr key={url.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                              <span
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: 'var(--radius-md)',
                                  background: 'var(--color-bg-tertiary)',
                                  border: '1px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--color-text-secondary)',
                                  flexShrink: 0,
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <a
                                  href={url.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {url.url}
                                </a>
                                {url.title && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {url.title}
                                  </span>
                                )}
                                {((url.status === 'success' && !url.is_indexed && url.indexing_error) || (url.status === 'failed' && url.last_error)) && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-error)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url.indexing_error || url.last_error}>
                                    {url.indexing_error || url.last_error}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>{renderStatusCell(url)}</td>
                          <td style={{ color: 'var(--color-text-secondary)' }}>
                            {url.last_fetch_at ? new Date(url.last_fetch_at).toLocaleString() : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                              {getIndexStatusBadge(url)?.showRebuild && (
                                <button
                                  onClick={handleRebuildIndex}
                                  className="btn-ghost"
                                  title="Rebuild index"
                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', display: 'flex' }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M23 4v6h-6M1 20v-6h6" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                  </svg>
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(url.id)}
                                disabled={deletingUrlId === url.id}
                                className="btn-ghost"
                                aria-label={t('buttons.delete')}
                                style={{ padding: '6px', borderRadius: 'var(--radius-sm)', color: deletingUrlId === url.id ? 'var(--color-error)' : 'var(--color-text-muted)', display: 'flex' }}
                              >
                                {deletingUrlId === url.id ? (
                                  <div className="spinner" style={{ width: '14px', height: '14px' }} />
                                ) : (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination footer */}
              <div className="table-card-footer">
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {total > 0
                    ? t('labels.showingOf', { shown: String(urls.length), total: String(total) })
                    : t('labels.urlManagement.total', { total: String(total) })}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1 || loading}
                    className="btn-ghost"
                    aria-label="Previous page"
                    style={{ padding: '4px', borderRadius: 'var(--radius-sm)', display: 'flex' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', alignSelf: 'center', padding: '0 var(--space-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="btn-ghost"
                    aria-label="Next page"
                    style={{ padding: '4px', borderRadius: 'var(--radius-sm)', display: 'flex' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </section>

            {/* Sources Summary below */}
            <div style={{ marginTop: 'var(--space-6)', maxWidth: isTablet && !isMobile ? 'calc(100% - 340px)' : undefined }}>
              <SourcesSummary agentId={agentId} refreshTrigger={0} />
            </div>
          </div>
        </KBSetupGuard>
      ) : (
        <div style={{ padding: isMobile ? 'var(--space-4)' : 'var(--space-8)', textAlign: 'center' }}>
          <div className="spinner" />
        </div>
      )}
    </AdminLayout>
  );
}
