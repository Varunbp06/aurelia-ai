'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout';
import AISettingsForm from '../components/AISettingsForm';
import { api, type Agent } from '../services/api';
import { API_BASE_URL } from '../lib/env';
import {
  validateAllowedWidgetOriginsText,
} from '../lib/widgetOrigins';
import {
  buildWidgetEmbedCode,
  resolveWidgetScriptBaseUrl,
} from '../lib/widgetEmbedCode';
import { useIsMobile } from '../hooks/useMediaQuery';

type SettingsTab = 'general' | 'widget' | 'embed' | 'providers';

interface AgentSettingsFormData {
  name: string;
  description: string;
  widget_title: string;
  widget_color: string;
  welcome_message: string;
  history_days: number;
  allowed_widget_origins: string[];
  rate_limit_per_minute: number;
  restricted_reply: string;
}

const DEFAULT_WIDGET_COLOR = '#00aaff';
const DEFAULT_HISTORY_DAYS = 30;

function formDataFromAgent(agent: Agent): AgentSettingsFormData {
  return {
    name: agent.name || '',
    description: agent.description || '',
    widget_title: agent.widget_title || '',
    widget_color: agent.widget_color || DEFAULT_WIDGET_COLOR,
    welcome_message: agent.welcome_message || '',
    history_days: agent.history_days || DEFAULT_HISTORY_DAYS,
    allowed_widget_origins: agent.allowed_widget_origins || [],
    rate_limit_per_minute: agent.rate_limit_per_minute ?? agent.rate_limit_per_hour ?? 20,
    restricted_reply: agent.restricted_reply ?? '',
  };
}

export default function AgentSettings() {
  const { t } = useTranslation('common');
  const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
  const isMobile = useIsMobile();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState<AgentSettingsFormData | null>(null);
  const [originsText, setOriginsText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadAgent();
  }, [routeAgentId]);

  const loadAgent = async () => {
    setLoading(true);
    setError(null);
    try {
      let loadedAgent: Agent;
      if (routeAgentId) {
        loadedAgent = await api.getAgent(routeAgentId);
      } else {
        loadedAgent = await api.getDefaultAgent();
      }
      setAgent(loadedAgent);
      const data = formDataFromAgent(loadedAgent);
      setFormData(data);
      setOriginsText(data.allowed_widget_origins.join('\n'));
    } catch {
      setError(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const embedCode = useMemo(() => {
    if (!agent) return '';
    const scriptBaseUrl = resolveWidgetScriptBaseUrl(API_BASE_URL);
    return buildWidgetEmbedCode(agent.id, scriptBaseUrl);
  }, [agent]);

  const handleSave = async () => {
    if (!agent || !formData) return;

    // Validate origins
    const { normalizedOrigins, invalidOrigins } = validateAllowedWidgetOriginsText(originsText);
    if (invalidOrigins.length > 0) {
      setValidationError(t('labels.embedWhitelistInvalid', { origins: invalidOrigins.join(', ') }));
      return;
    }
    setValidationError(null);

    if (activeTab === 'general' && !formData.name.trim()) {
      setValidationError(t('settings.agentName'));
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<Agent> = {
        name: formData.name.trim(),
        description: formData.description,
        widget_title: formData.widget_title,
        widget_color: formData.widget_color,
        welcome_message: formData.welcome_message,
        history_days: formData.history_days,
        allowed_widget_origins: normalizedOrigins,
        rate_limit_per_minute: typeof formData.rate_limit_per_minute === 'number' ? formData.rate_limit_per_minute : 20,
        restricted_reply: formData.restricted_reply ?? '',
      };
      const updatedAgent = await api.updateAgent(agent.id, updates);
      setAgent(updatedAgent);
      setFormData(formDataFromAgent(updatedAgent));
      setOriginsText(normalizedOrigins.join('\n'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AgentSettingsFormData>(field: K, value: AgentSettingsFormData[K]) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setValidationError(null);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ padding: isMobile ? 'var(--space-4)' : 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </AdminLayout>
    );
  }

  if (error && !agent) {
    return (
      <AdminLayout>
        <div style={{ padding: isMobile ? 'var(--space-4)' : 'var(--space-8)', textAlign: 'center', color: 'var(--color-error)' }}>
          {error}
        </div>
      </AdminLayout>
    );
  }

  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'general', label: t('settings.tabGeneral') },
    { key: 'widget', label: t('settings.tabWidgetAppearance') },
    { key: 'embed', label: t('settings.tabEmbedDomains') },
    { key: 'providers', label: t('settings.tabProviders') },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: isMobile ? 'var(--space-4)' : 'var(--space-6)', maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <header
          style={{
            marginBottom: 'var(--space-6)',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <h1 style={{
              fontSize: isMobile ? 'var(--text-2xl)' : '28px',
              lineHeight: '36px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--color-text-primary)',
              marginBottom: 'var(--space-1)',
            }}>
              {t('navigation.agentSettings')}
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('labels.configAgentSettings')}
            </p>
          </div>
          {activeTab !== 'providers' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? (
                <>
                  <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} />
                  {t('status.saving')}
                </>
              ) : (
                t('settings.saveChanges')
              )}
            </button>
          )}
        </header>

        {validationError && (
          <div
            role="alert"
            className="animate-fade-in"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              marginBottom: 'var(--space-4)',
              background: 'var(--color-error-bg)',
              border: '1px solid rgba(186,26,26,0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-error)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {validationError}
          </div>
        )}

        {error && agent && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              marginBottom: 'var(--space-4)',
              background: 'var(--color-error-bg)',
              border: '1px solid rgba(186,26,26,0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-error)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </div>
        )}

        {saved && (
          <div
            className="animate-fade-in"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              marginBottom: 'var(--space-4)',
              background: 'var(--color-success-bg)',
              border: '1px solid rgba(0,101,92,0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-success)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {t('labels.settingsSaved')}
          </div>
        )}

        {/* Settings shell */}
        <section className="liquid-glass-card" style={{ overflow: 'hidden', padding: 0 }}>
          {/* Tabs */}
          <div className="au-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`au-tab ${activeTab === tab.key ? 'au-tab-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: isMobile ? 'var(--space-5) var(--space-4)' : 'var(--space-8)', maxWidth: '640px' }}>

            {/* ==================== General ==================== */}
            {activeTab === 'general' && (
              <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{t('settings.generalSettings')}</h2>

                {/* Agent Name */}
                <div>
                  <label htmlFor="agent_name" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('settings.agentName')}
                  </label>
                  <input
                    id="agent_name"
                    type="text"
                    value={formData?.name ?? ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    maxLength={10}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginTop: 'var(--space-2)' }}>
                    {t('settings.agentNameHint')}
                  </p>
                </div>

                {/* Avatar — initials only (backend caps avatar at 500 chars; no upload endpoint) */}
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    Avatar
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'rgba(67,67,213,0.08)',
                        border: '1px solid rgba(67,67,213,0.2)',
                        color: 'var(--color-accent-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: 'var(--text-xl)',
                      }}
                    >
                      {(formData?.name || 'A').charAt(0).toUpperCase()}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--color-outline)', margin: 0, maxWidth: '360px' }}>
                      {t('settings.avatarNotConfigurable')}
                    </p>
                  </div>
                </div>

                {/* Primary Language — informational (no per-agent language field exists) */}
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    Language
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', margin: 0 }}>
                    {t('settings.languageNotConfigurable')}
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="agent_description" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('settings.agentDescription')}
                  </label>
                  <textarea
                    id="agent_description"
                    rows={4}
                    value={formData?.description ?? ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    maxLength={200}
                    placeholder={t('settings.agentDescriptionHint')}
                    style={{ resize: 'vertical' }}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginTop: 'var(--space-2)' }}>
                    {t('settings.agentDescriptionHint')}
                  </p>
                </div>
              </div>
            )}

            {/* ==================== Widget Appearance ==================== */}
            {activeTab === 'widget' && (
              <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '-8px' }}>
                  {t('settings.widgetAppearanceHint')}
                </p>

                <div>
                  <label htmlFor="widget_title" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.widgetTitle')}
                  </label>
                  <input
                    id="widget_title"
                    type="text"
                    value={formData?.widget_title ?? ''}
                    onChange={(e) => updateField('widget_title', e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="widget_color" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.themeColor')}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <input
                      id="widget_color"
                      type="color"
                      value={formData?.widget_color || DEFAULT_WIDGET_COLOR}
                      onChange={(e) => updateField('widget_color', e.target.value)}
                      style={{ width: '56px', height: '40px', padding: '4px', cursor: 'pointer' }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {formData?.widget_color || DEFAULT_WIDGET_COLOR}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="welcome_message" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.welcomeMessage')}
                  </label>
                  <textarea
                    id="welcome_message"
                    rows={3}
                    value={formData?.welcome_message ?? ''}
                    onChange={(e) => updateField('welcome_message', e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label htmlFor="history_days" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.historyRetention')}
                  </label>
                  <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginTop: 'var(--space-2)' }}>
                    {t('settings.historyDaysUnit')}
                  </p>
                  <input
                    id="history_days"
                    type="number"
                    min={1}
                    max={365}
                    value={formData?.history_days || DEFAULT_HISTORY_DAYS}
                    onChange={(e) => updateField('history_days', parseInt(e.target.value, 10) || DEFAULT_HISTORY_DAYS)}
                    style={{ width: '120px' }}
                  />
                </div>

                <div>
                  <label htmlFor="rate_limit" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.aiConversationLimit')}
                  </label>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.aiConversationLimitDesc')}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <input
                      id="rate_limit"
                      type="number"
                      min={0}
                      aria-label={t('labels.perMinuteLimit')}
                      value={formData?.rate_limit_per_minute ?? 20}
                      onChange={(e) => {
                        const value = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                        updateField('rate_limit_per_minute', isNaN(value) ? 0 : value);
                      }}
                      style={{ width: '110px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      / {t('labels.perMinuteLimit').toLowerCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginTop: 'var(--space-2)' }}>
                    {t('labels.zeroMeansNoLimit')}
                  </p>

                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <label htmlFor="restricted_reply" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                      {t('labels.restrictedReplyLabel')}
                    </label>
                    <textarea
                      id="restricted_reply"
                      rows={2}
                      value={formData?.restricted_reply ?? ''}
                      onChange={(e) => updateField('restricted_reply', e.target.value)}
                      placeholder={t('labels.restrictedReplyPlaceholder')}
                      style={{ resize: 'vertical' }}
                    />
                    <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginTop: 'var(--space-2)' }}>
                      {t('labels.restrictedReplyDesc')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== Embed & Domains ==================== */}
            {activeTab === 'embed' && (
              <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '-8px' }}>
                  {t('settings.embedDomainsHint')}
                </p>

                <div>
                  <label htmlFor="allowed_widget_origins" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.embedWhitelist')}
                  </label>
                  <textarea
                    id="allowed_widget_origins"
                    rows={4}
                    value={originsText}
                    onChange={(e) => {
                      setOriginsText(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder={t('placeholders.embedWhitelist')}
                    style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-outline)', marginTop: 'var(--space-2)' }}>
                    {t('labels.embedWhitelistFormatHint')}
                  </p>
                </div>

                <div>
                  <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('labels.widgetEmbedCode')}
                  </span>
                  <div style={{
                    padding: 'var(--space-4)',
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    lineHeight: 1.7,
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {embedCode}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== Providers ==================== */}
            {activeTab === 'providers' && (
              <div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '-8px', marginBottom: 'var(--space-5)' }}>
                  {t('settings.providersTabHint')}
                </p>
                <AISettingsForm
                  agentId={agent?.id}
                  compact
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
