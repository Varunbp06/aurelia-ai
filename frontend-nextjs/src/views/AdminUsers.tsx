'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';
import { api, parseErrorResponse } from '../services/api';
import { useIsMobile } from '../hooks/useMediaQuery';

type AdminRole = 'super_admin' | 'admin' | 'support';
type AdminUser = {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  role: AdminRole;
};

const roleKeys: AdminRole[] = ['super_admin', 'admin', 'support'];
const agentRoleKeys: AdminRole[] = ['admin', 'support'];

function RolePill({ role }: { role: AdminRole }) {
  return (
    <span className={`role-pill role-pill-${role}`}>
      {role === 'super_admin' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )}
      {role}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'rgba(67,67,213,0.08)',
        border: '1px solid rgba(67,67,213,0.15)',
        color: 'var(--color-accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </div>
  );
}

export const AdminUsers = () => {
  const { t } = useTranslation();
  const { agentId } = useParams<{ agentId?: string }>();
  const isMobile = useIsMobile();
  const { token, admin } = useAuth();
  const isSuperAdmin = admin?.role === 'super_admin';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({email: '',name: '',password: '',is_active: true,role: 'admin' as AdminRole});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const availableRoleKeys = agentId ? agentRoleKeys : roleKeys;
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

    const loadUsers = async () => {
      if (agentId) {
        const data = await api.listAgentMembers(agentId);
        setUsers(data.members.map(member => ({
          id: member.id,
          email: member.email,
          name: member.name,
          is_active: member.is_active,
          role: member.member_role as AdminRole,
        })));
        return;
      }

      if (!isSuperAdmin && admin) {
        setUsers([{
          id: admin.id,
          email: admin.email,
          name: admin.name,
          is_active: true,
          role: admin.role as AdminRole,
        }]);
        return;
      }

      const res = await fetch('/api/admin/users', { headers: authHeaders });
      if (!res.ok) throw new Error(await parseErrorResponse(res) || t('users.loadUsersFailed'));
      const data = await res.json();
      setUsers(data);
    };

useEffect(() => {
  if (!token) return;
  loadUsers()
    .catch((err) => setError(err.message))
    .finally(() => setUsersLoading(false));
}, [token, isSuperAdmin, admin]);

useEffect(() => {
  if (!agentId) return;
  if (role === 'super_admin') {
    setRole('admin');
  }
  if (editData.role === 'super_admin') {
    setEditData(prev => ({ ...prev, role: 'admin' }));
  }
}, [agentId, editData.role, role]);

  // Client-side filtering over the loaded list.
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  // CSV export of the currently loaded list.
  const handleExport = () => {
    const header = ['id', 'name', 'email', 'role', 'status'];
    const rows = filteredUsers.map((u) => [
      u.id,
      '"' + u.name.replace(/"/g, '""') + '"',
      u.email,
      u.role,
      u.is_active ? 'active' : 'disabled',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'users.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (agentId) {
      const data = await api.createAgentMember(agentId, { email, name, password, role: role === 'super_admin' ? 'admin' : role });
      setMessage(t('users.userCreated', { email: data.email }));
      setEmail('');
      setName('');
      setPassword('');
      setRole('admin');
      setShowInviteForm(false);
      await loadUsers();
      return;
    }

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, name, password, role }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || t('users.createFailed'));
      return;
    }

    setMessage(t('users.userCreated', { email: data.email }));
    setEmail('');
    setName('');
    setPassword('');
    setRole('admin');
    setShowInviteForm(false);
    await loadUsers();
  };

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditData({email: user.email,name: user.name,password: '',is_active: user.is_active,role: user.role});
  };

  const saveEdit = async (id: number) => {
    setMessage('');
    setError('');

    if (agentId) {
      await api.createAgentMember(agentId, {
        email: editData.email,
        name: editData.name,
        password: editData.password.trim() || undefined,
        role: editData.role === 'super_admin' ? 'admin' : editData.role,
      });
      setEditingId(null);
      setMessage(t('users.userUpdated'));
      await loadUsers();
      return;
    }

    const payload: Record<string, unknown> = {
      email: editData.email,
      name: editData.name,
      is_active: editData.is_active,
      role: editData.role,
    };

    if (editData.password.trim()) {
      payload.password = editData.password;
    }

    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || t('users.saveFailed'));
      return;
    }

    setEditingId(null);
    setMessage(t('users.userUpdated'));
    await loadUsers();
  };

  const deleteUser = async (id: number) => {
    if (!window.confirm(t('users.confirmDelete'))) return;

    if (agentId) {
      const res = await api.deleteAgentMember(agentId, id);
      if (!res.success) {
        setError(t('users.deleteFailed'));
        return;
      }
      setMessage(t('users.userDeleted'));
      await loadUsers();
      return;
    }

    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail || t('users.deleteFailed'));
      return;
    }

    setMessage(t('users.userDeleted'));
    await loadUsers();
  };

  return (
    <AdminLayout>
      <div style={{ width: '100%', maxWidth: 1120, margin: '0 auto', padding: isMobile ? 'var(--space-4)' : 'var(--space-8)' }}>
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
              {t('users.title')}
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('users.subtitle')}
            </p>
          </div>
          {isSuperAdmin && (
            <button onClick={() => setShowInviteForm((v) => !v)} className="btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              {t('labels.inviteUser')}
            </button>
          )}
        </header>

        {message && (
          <div className="animate-fade-in" style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-success-bg)', border: '1px solid rgba(0,101,92,0.25)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            {message}
          </div>
        )}
        {error && (
          <div role="alert" style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-error-bg)', border: '1px solid rgba(186,26,26,0.25)', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            {error}
          </div>
        )}

        {/* Invite form */}
        {isSuperAdmin && showInviteForm && (
          <section className="liquid-glass-card animate-fade-in" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>{t('users.addAdmin')}</h2>
            <form onSubmit={createUser} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 160px auto', gap: 'var(--space-3)', alignItems: isMobile ? 'stretch' : 'end' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.email')}
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.name')}
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.password')}
                <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.role')}
                <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                  {availableRoleKeys.map((r) => (<option key={r} value={r}>{t(`users.roleLabels.${r}`)}</option>))}
                </select>
              </label>
              <button type="submit">{t('users.create')}</button>
            </form>
          </section>
        )}

        {/* Users table card */}
        <section className="table-card">
          {/* Toolbar */}
          <div className="table-card-header" style={{ flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
              <input
                type="text"
                placeholder={t('users.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 'var(--space-7)', fontSize: 'var(--text-xs)', background: 'var(--color-bg-secondary)' }}
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn-secondary" style={{ fontSize: 'var(--text-xs)' }} onClick={() => setSearchQuery('')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {t('labels.filter')}
              </button>
              <button className="btn-secondary" style={{ fontSize: 'var(--text-xs)' }} onClick={handleExport}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t('buttons.export')}
              </button>
            </div>
          </div>

          {usersLoading ? (
            <div style={{ padding: 'var(--space-4)' }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton skeleton-text" style={{ height: '40px' }} />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-4)', color: 'var(--color-text-muted)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto var(--space-3)', opacity: 0.4 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p style={{ fontSize: 'var(--text-sm)' }}>{t('labels.noData')}</p>
            </div>
          ) : isMobile ? (
            <div>
              {filteredUsers.map((user) => (
                <div key={user.id} style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                  {editingId === user.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>#{user.id}</span>
                        <RolePill role={user.role} />
                      </div>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.email')}
                        <input value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
                      </label>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.name')}
                        <input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                      </label>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>{t('users.role')}
                        <select value={editData.role} onChange={(e) => setEditData({ ...editData, role: e.target.value as AdminRole })}>
                          {availableRoleKeys.map((r) => (<option key={r} value={r}>{t(`users.roleLabels.${r}`)}</option>))}
                        </select>
                      </label>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <input type="checkbox" checked={editData.is_active} onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })} />
                        {t('users.statusEnabled')}
                      </label>
                      <input type="password" placeholder={t('users.newPasswordPlaceholder')} value={editData.password} onChange={(e) => setEditData({ ...editData, password: e.target.value })} />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button onClick={() => saveEdit(user.id)} className="btn-primary" style={{ flex: 1 }}>{t('users.save')}</button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ flex: 1 }}>{t('users.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                        <Avatar name={user.name} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{user.name}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                        </div>
                        <RolePill role={user.role} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
                          <span className={`status-dot ${user.is_active ? 'status-dot-active' : 'status-dot-offline'}`} />
                          {user.is_active ? t('users.statusEnabled') : t('users.statusDisabled')}
                        </span>
                        {isSuperAdmin && (
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <button onClick={() => startEdit(user)} className="btn-ghost" style={{ fontSize: 'var(--text-xs)', minHeight: '36px' }}>{t('users.edit')}</button>
                            <button onClick={() => deleteUser(user.id)} className="btn-ghost" style={{ fontSize: 'var(--text-xs)', minHeight: '36px', color: 'var(--color-error)' }}>{t('users.delete')}</button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="au-table">
                <thead>
                  <tr>
                    <th>{t('users.userAndEmail')}</th>
                    <th style={{ width: '18%' }}>{t('users.role')}</th>
                    <th style={{ width: '14%' }}>{t('users.status')}</th>
                    {isSuperAdmin && <th style={{ width: '14%', textAlign: 'right' }}>{t('users.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <Avatar name={user.name} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500 }}>{user.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {editingId === user.id ? (
                          <select
                            value={editData.role}
                            onChange={(e) => setEditData({ ...editData, role: e.target.value as AdminRole })}
                            style={{ maxWidth: '140px' }}
                          >
                            {availableRoleKeys.map((r) => (<option key={r} value={r}>{t(`users.roleLabels.${r}`)}</option>))}
                          </select>
                        ) : (
                          <RolePill role={user.role} />
                        )}
                      </td>
                      <td>
                        {editingId === user.id ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
                            <input type="checkbox" checked={editData.is_active} onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })} />
                            {t('users.statusEnabled')}
                          </label>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
                            <span className={`status-dot ${user.is_active ? 'status-dot-active' : 'status-dot-offline'}`} />
                            {user.is_active ? t('users.statusEnabled') : t('users.statusDisabled')}
                          </span>
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          {editingId === user.id ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <input
                                type="password"
                                placeholder={t('users.newPasswordPlaceholder')}
                                value={editData.password}
                                onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                                style={{ maxWidth: '160px' }}
                              />
                              <button onClick={() => saveEdit(user.id)} className="btn-primary" style={{ fontSize: 'var(--text-xs)' }}>{t('users.save')}</button>
                              <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: 'var(--text-xs)' }}>{t('users.cancel')}</button>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                              <button onClick={() => startEdit(user)} className="btn-ghost" aria-label={t('users.edit')}
                                style={{ padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', display: 'flex' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
                              </button>
                              <button onClick={() => deleteUser(user.id)} className="btn-ghost" aria-label={t('users.delete')}
                                style={{ padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--color-error)', display: 'flex' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination footer — full list loaded; count only */}
          <div className="table-card-footer">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {t('labels.showingOf', { shown: String(filteredUsers.length), total: String(users.length) })}
            </span>
            <span />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
