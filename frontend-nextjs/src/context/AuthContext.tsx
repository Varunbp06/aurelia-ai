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
	/** True when the visitor is inside a frontend-only demo session. */
	isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_STORAGE_KEY = "token";
const ADMIN_STORAGE_KEY = "admin";
const DEMO_MODE_KEY = "demo_mode";

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
}

/**
 * Next.js rewrites return a plain 500 response when the configured backend
 * cannot be reached. Treat only that proxy-shaped response (or gateway
 * statuses) as demo-mode availability; real API errors must still be shown.
 */
export async function isBackendUnavailableResponse(response: Response): Promise<boolean> {
	if ([502, 503, 504].includes(response.status)) {
		return true;
	}
	if (response.status !== 500) {
		return false;
	}

	const contentType = (response.headers.get("content-type") || "").toLowerCase();
	// Next's failed rewrite currently omits content-type; accept that exact
	// body while still rejecting JSON errors returned by the backend.
	if (contentType && !contentType.includes("text/plain")) {
		return false;
	}

	const body = await response.clone().text().catch(() => "");
	return body.trim().toLowerCase() === "internal server error";
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation("auth");
	const [admin, setAdmin] = useState<Admin | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return localStorage.getItem(DEMO_MODE_KEY) === "1";
	});
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
		setIsDemoMode(false);
		localStorage.removeItem(TOKEN_STORAGE_KEY);
		localStorage.removeItem(ADMIN_STORAGE_KEY);
		localStorage.removeItem(DEMO_MODE_KEY);
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
		setIsDemoMode(false);
		localStorage.removeItem(DEMO_MODE_KEY);
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
			// Frontend demo sessions have no real backend to verify against.
			// Keep the simulated identity unlocked and disclosed instead of
			// dropping to a restricted state.
			if (isDemoMode) {
				setAdminStatus('verified');
				setIsLoading(false);
				return;
			}
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
	}, [token, logout, verifyNonce, isDemoMode]);

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
		let response: Response;
		try {
			response = await fetch(`${API_BASE_URL}/api/admin/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
		} catch {
			// Backend unreachable: Aurelia AI is a resume demonstration, so
			// enter a clearly-disclosed frontend-only demo session instead of
			// a dead end. No account is created and no token is real.
			enterDemoSession(email);
			return;
		}

		if (!response.ok) {
			if (await isBackendUnavailableResponse(response)) {
				enterDemoSession(email);
				return;
			}
			const message = await parseErrorResponse(response);
			throw new Error(message || t("errors.loginFailed"));
		}

		const data = await response.json();

		persistSession(data);
	};

	/**
	 * Frontend-only demo session: a synthetic admin identity stored locally.
	 * Explicitly marked demo mode so the UI can disclose it. Never claims a
	 * real account or authentication token.
	 */
	const enterDemoSession = useCallback((email: string) => {
		const demoAdmin: Admin = {
			id: 0,
			email: email || "demo@aurelia.local",
			name: "Demo Admin",
			role: "admin",
		};
		setIsDemoMode(true);
		localStorage.setItem(DEMO_MODE_KEY, "1");
		persistSession({
			access_token: "demo-session",
			admin: demoAdmin,
		});
	}, [persistSession]);

	const register = async (email: string, password: string, name: string) => {
		let response: Response;
		try {
			response = await fetch(`${API_BASE_URL}/api/admin/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password, name }),
			});
		} catch {
			// No account is created offline. Enter the same disclosed demo mode as
			// login so the first-run path remains usable without a fake backend.
			enterDemoSession(email);
			return;
		}

		if (!response.ok) {
			if (await isBackendUnavailableResponse(response)) {
				enterDemoSession(email);
				return;
			}
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
			value={{ admin, token, login, logout, register, isLoading, adminStatus, revalidate, isDemoMode }}
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
