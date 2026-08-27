'use client';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../lib/env'
import { parseErrorResponse } from '../services/api';

export const Setup = () => {
    const { t } = useTranslation('common');
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
    const [modelName, setModelName] = useState('gpt-3.5-turbo');
    const [systemPrompt, setSystemPrompt] = useState(t('settings.defaultSystemPrompt'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { token } = useAuth();
    const navigate = useNavigate();

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const defaultAgentRes = await fetch(`${API_BASE_URL}/api/v1/agent:default`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!defaultAgentRes.ok) {
                const message = await parseErrorResponse(defaultAgentRes);
                throw new Error(message || t('settings.setupFailed'));
            }

            const defaultAgent = await defaultAgentRes.json();

            const res = await fetch(`${API_BASE_URL}/api/v1/agent?agent_id=${defaultAgent.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    api_base: baseUrl,
                    model: modelName,
                    system_prompt: systemPrompt,
                    provider_type: 'openai',
                    enable_context: false,
                    rate_limit_per_minute: 20,
                    restricted_reply: t('settings.defaultReply')
                })
            });

            if (!res.ok) {
                const message = await parseErrorResponse(res);
                throw new Error(message || t('settings.setupFailed'));
            }

            navigate('/');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('settings.setupFailedRetry'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh', background: 'var(--color-bg-primary)', padding: 'var(--space-4)'
        }}>
            <div style={{
                background: 'var(--color-bg-secondary)', padding: 'var(--space-8)', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-md)', width: '100%', maxWidth: '600px', border: '1px solid var(--color-border)'
            }}>
                <h1 style={{ textAlign: 'center', marginBottom: 'var(--space-2)', color: 'var(--color-text-primary)', fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.01em' }}>{t('settings.aiConfigWizard')}</h1>
                <p style={{ textAlign: 'center', marginBottom: 'var(--space-6)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                    {t('settings.aiConfigWizardDesc')}
                </p>

                {error && <div style={{
                    background: 'var(--color-error-bg)', color: 'var(--color-error)', padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', border: '1px solid rgba(186,26,26,0.25)'
                }}>{error}</div>}

                <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                            {t('settings.apiKey')} <span style={{ color: 'var(--color-error)' }}>*</span>
                        </label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            required
                            disabled={loading}
                        />
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                            {t('settings.apiKeyDesc')}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                                {t('settings.baseUrl')}
                            </label>
                            <input
                                type="text"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="https://api.openai.com/v1"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                                {t('settings.modelName')}
                            </label>
                            <input
                                type="text"
                                value={modelName}
                                onChange={(e) => setModelName(e.target.value)}
                                placeholder="gpt-3.5-turbo"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                            {t('labels.presetPersona')}
                        </label>
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            rows={4}
                            disabled={loading}
                        />
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                            {t('settings.definePersona')}
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !apiKey}
                        className="btn-primary"
                        style={{
                            marginTop: 'var(--space-2)',
                            opacity: (loading || !apiKey) ? 0.5 : 1
                        }}
                    >
                        {loading ? t('settings.saving') : t('settings.completeSetup')}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="btn-secondary"
                        disabled={loading}
                    >
                        {t('settings.skipSetup')}
                    </button>
                </form>
            </div>
        </div>
    );
};
