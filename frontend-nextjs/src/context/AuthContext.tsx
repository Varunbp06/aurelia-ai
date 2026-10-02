"use client";

import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../lib/env";
import { parseErrorResponse } from "../services/api";

interface Admin {
	id: number;
	email: string;
	name: string;
	role: string;
}

/**
 * Whether the current admin role has been confirmed by the backend.
 *
 * - `pending`  cached session restored, /api/admin/me not yet answered
 * - `verified` backend confirmed the identity and role
 * - `failed`   verification could not complete (network/server error)
 *
 * Only `verified` may unlock privileged UI.
 */
export type AdminStatus = 'pending' | 'verified' | 'failed';

interface AuthContextType {
	admin: Admin | null;
	token: string | null;
	login: (email: string, password: string) => Promise<void>;
	logout: () => void;
	register: (email: string, password: string, name: string) => Promise<void>;
	isLoading: boolean;
	adminStatus: AdminStatus;
	revalidate: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_STORAGE_KEY = "token";
const ADMIN_STORAGE_KEY = "admin";

interface LoginResponseData {
	access_token: string;
	admin: Admin;
}

/** All expected JWT claims plus room for extras from the backend. */
export interface JwtPayload {
	exp?: number;
	sub?: string;
	[key: string]: unknown;
}

export function parseJwtPayload(token: string): JwtPayload | null {
	try {
		const parts = token.split(".");
		if (parts.length < 2) {
			return null;
		}
		const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
		return JSON.parse(window.atob(padded)) as JwtPayload;
	} catch {
		return null;
	}
}

function isTokenExpired(token: string): boolean {
	const payload = parseJwtPayload(token);
	if (!payload?.exp) {
		return false;
	}
	return payload.exp * 1000 <= Date.now();
}export function AuthProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation("auth");
	const [admin, setAdmin] = useState<Admin | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	// A cached admin object is a hint for rendering only. Privileged UI is
	// granted once (and only once) the backend has confirmed the current role,
	// so a downgrade or deactivation cannot be masked by stale local state.
	const [adminStatus, setAdminStatus] = useState<AdminStatus>('pending');
	const [verifyNonce, setVerifyNonce] = useState(0);

	const revalidate = useCallback(() => {
		setAdminStatus('pending');
		setIsLoading(true);
		setVerifyNonce((n) => n + 1);
	}, []);

	const persistSession = useCallback((data: LoginResponseData) => {
		setToken(data.access_token);
		setAdmin(data.admin);
		setAdminStatus('verified');
		setIsLoading(false);
		localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
		localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(data.admin));
	}, []);

	const logout = useCallback(() => {
		setToken(null);
		setAdmin(null);
		setAdminStatus('pending');
		setIsLoading(false);
		localStorage.removeItem(TOKEN_STORAGE_KEY);
		localStorage.removeItem(ADMIN_STORAGE_KEY);
	}, []);

	useEffect(() => {
		const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
		const savedAdmin = localStorage.getItem(ADMIN_STORAGE_KEY);

		if (savedToken && savedAdmin && !isTokenExpired(savedToken)) {
			try {
				setToken(savedToken);
				// Cached value only. isLoading stays true until /api/admin/me
				// answers, so the cached role never grants access on its own.
				setAdmin(JSON.parse(savedAdmin));
				setAdminStatus('pending');
				return;
			} catch {
				localStorage.removeItem(TOKEN_STORAGE_KEY);
				localStorage.removeItem(ADMIN_STORAGE_KEY);
			}
		}
		// No saved session — user must log in via the login page.
		setIsLoading(false);
	}, [persistSession]);

	// Refresh admin role from the backend on mount so that role changes
	// (e.g. readonly → support migration, role downgrade) are reflected
	// without requiring a re-login.
	useEffect(() => {
		if (!token || isTokenExpired(token)) {
			return;
		}

		let cancelled = false;

		const refresh = async () => {
			try {
				const response = await fetch(`${API_BASE_URL}/api/admin/me`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!response.ok) {
					// Token invalid or user deactivated — clear auth state.
					logout();
					return;
				}
				const data = await response.json();
				if (!cancelled) {
					const updated = {
						id: data.id,
						email: data.email,
						name: data.name,
						role: data.role,
					};
					setAdmin(updated);
					setAdminStatus('verified');
					setIsLoading(false);
					localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(updated));
				}
			} catch {
				// Verification could not complete. Stay signed in but drop to a
				// restricted state: keeping the cached role here is what let a
				// demoted or deactivated admin keep privileged UI while the
				// backend was unreachable.
				if (!cancelled) {
					setAdminStatus('failed');
					setIsLoading(false);
				}
			}
		};

		refresh();
		return () => {
			cancelled = true;
		};
	}, [token, logout, verifyNonce]);

	useEffect(() => {
		if (!token) {
			return;
		}

		const payload = parseJwtPayload(token);
		if (!payload?.exp) {
			return;
		}

		const expiresAt = payload.exp * 1000;
		const delay = expiresAt - Date.now();
		if (delay <= 0) {
			logout();
			return;
		}

		const timer = window.setTimeout(() => {
			logout();
		}, delay);

		return () => {
			window.clearTimeout(timer);
		};
	}, [logout, token]);

	const login = async (email: string, password: string) => {
		const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});

		if (!response.ok) {
			const message = await parseErrorResponse(response);
			throw new Error(message || t("errors.loginFailed"));
		}

		const data = await response.json();

		persistSession(data);
	};

	const register = async (email: string, password: string, name: string) => {
		const response = await fetch(`${API_BASE_URL}/api/admin/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password, name }),
		});

		if (!response.ok) {
			const message = await parseErrorResponse(response);
			throw new Error(message || "注册失败");
		}

		const data = await response.json();
		if (data.access_token && data.admin) {
			persistSession(data);
			return;
		}

		await login(email, password);
	};

	return (
		<AuthContext.Provider
			value={{ admin, token, login, logout, register, isLoading, adminStatus, revalidate }}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
