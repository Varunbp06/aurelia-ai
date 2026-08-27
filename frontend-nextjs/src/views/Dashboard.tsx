"use client";

import { useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
import AdminLayout from "../components/AdminLayout";
import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import type { Agent } from "../services/api";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../hooks/useMediaQuery";

// Lazy-loaded WebGL background wash — mounted only behind the Dashboard hero band.
const DashboardShader = lazy(() => import("../components/DashboardShader"));

interface SourcesSummary {
	urls: { total: number; indexed: number; pending: number };
	files: { total: number; ready: number; processing: number };
	has_pending: boolean;
}

interface ActivityEntry {
	id: string;
	icon: JSX.Element;
	tone: "primary" | "tertiary" | "error" | "neutral";
	text: string;
	highlight?: string;
	time: Date;
}

function formatRelativeTime(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "<1m";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

/* Stat card — flat bordered surface with tinted icon tile (Stitch Overview) */
function StatCard({
	label,
	value,
	sub,
	badge,
	icon,
	iconTone = "primary",
}: {
	label: string;
	value: string | number;
	sub?: string;
	badge?: { tone: "success" | "error" | "neutral"; text: string; live?: boolean };
	icon: JSX.Element;
	iconTone?: "primary" | "tertiary" | "error";
}) {
	const tileTone =
		iconTone === "tertiary"
			? { background: "rgba(0,101,92,0.08)", color: "var(--color-success)" }
			: iconTone === "error"
				? { background: "rgba(186,26,26,0.08)", color: "var(--color-error)" }
				: { background: "rgba(67,67,213,0.08)", color: "var(--color-accent-primary)" };
	const badgeClass =
		badge?.tone === "success"
			? "badge-success"
			: badge?.tone === "error"
				? "badge-error"
				: "badge-neutral";
	return (
		<div className="liquid-glass-card" style={{ padding: "var(--space-5)" }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: "var(--space-4)",
					gap: "var(--space-2)",
				}}
			>
				<span
					style={{
						width: "44px",
						height: "44px",
						borderRadius: "var(--radius-md)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexShrink: 0,
						...tileTone,
					}}
				>
					{icon}
				</span>
				{badge && (
					<span className={`badge ${badgeClass} ${badge.live ? "badge-pulse" : ""}`}>
						{badge.live && <span className="badge-dot" />}
						{badge.text}
					</span>
				)}
			</div>
			<div
				style={{
					fontSize: "var(--text-xs)",
					fontWeight: 500,
					color: "var(--color-text-secondary)",
					letterSpacing: "0.05em",
					textTransform: "uppercase",
					marginBottom: "var(--space-1)",
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: "var(--text-4xl)",
					fontWeight: 700,
					color: "var(--color-text-primary)",
					lineHeight: 1.1,
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{value}
			</div>
			{sub && (
				<div
					style={{
						marginTop: "var(--space-2)",
						fontSize: "var(--text-xs)",
						color: "var(--color-text-muted)",
					}}
				>
					{sub}
				</div>
			)}
		</div>
	);
}

export default function Dashboard() {
	const { t } = useTranslation("common");
	const navigate = useNavigate();
	const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
	const { admin } = useAuth();
	const isMobile = useIsMobile();
	const agentIdCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const [agent, setAgent] = useState<Agent | null>(null);
	const [sourcesSummary, setSourcesSummary] = useState<SourcesSummary | null>(
		null,
	);
	const [recentUrls, setRecentUrls] = useState<
		Array<{ id: number; url: string; title?: string; updated_at?: string; last_fetch_at?: string }>
	>([]);
	const [recentFiles, setRecentFiles] = useState<
		Array<{ id: string; filename: string; created_at: string }>
	>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [agentIdCopied, setAgentIdCopied] = useState(false);
	const [sessionBuckets, setSessionBuckets] = useState<number[]>(
		[0, 0, 0, 0, 0, 0, 0],
	);
	// Locale day labels are client-only (SSR timezone would mismatch hydration).
	const [dayLabels, setDayLabels] = useState<string[]>(["", "", "", "", "", "", ""]);

	useEffect(() => {
		setDayLabels(
			Array.from({ length: 7 }, (_, i) => {
				const d = new Date();
				d.setDate(d.getDate() - (6 - i));
				return d.toLocaleDateString(undefined, { weekday: "short" });
			}),
		);
	}, []);

	useEffect(() => {
		loadData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const loadData = async () => {
		setLoading(true);
		setLoadError(null);
		try {
			if (!routeAgentId) {
				navigate("/");
				return;
			}
			const agentData = await api.getAgent(routeAgentId);
			setAgent(agentData);
			const summary = await api.getSourcesSummary(agentData.id);
			setSourcesSummary(summary);
			// Best-effort activity data; failures here don't block the page.
			const [urlsRes, filesRes] = await Promise.allSettled([
				api.listURLs(agentData.id, 0, 8),
				api.listFiles(agentData.id, 0, 8),
			]);
			if (urlsRes.status === "fulfilled") {
				setRecentUrls(urlsRes.value.urls);
			}
			if (filesRes.status === "fulfilled") {
				setRecentFiles(filesRes.value.files);
			}
			// 7-day session volume buckets (real data, best-effort)
			try {
				const token = localStorage.getItem("token");
				const res = await fetch(
					`/api/v1/admin/sessions?skip=0&limit=500${routeAgentId ? `&agent_id=${routeAgentId}` : ""}`,
					{ headers: token ? { Authorization: `Bearer ${token}` } : {} },
				);
				if (res.ok) {
					const data = await res.json();
					const buckets = [0, 0, 0, 0, 0, 0, 0];
					const now = new Date();
					for (const s of data.items ?? []) {
						const created = new Date(s.created_at);
						const dayDiff = Math.floor(
							(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
								new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime()) /
								86400000,
						);
						if (dayDiff >= 0 && dayDiff < 7) {
							buckets[6 - dayDiff] += 1;
						}
					}
					setSessionBuckets(buckets);
				}
			} catch {
				// chart is best-effort
			}
		} catch (error) {
			console.error("Failed to load data:", error);
			setLoadError(
				error instanceof Error ? error.message : t("errors.unknown"),
			);
		} finally {
			setLoading(false);
		}
	};

	const getGreeting = () => {
		const hour = new Date().getHours();
		if (hour < 12) return t("time.goodMorning");
		if (hour < 18) return t("time.goodAfternoon");
		return t("time.goodEvening");
	};

	const handleCopyAgentId = async () => {
		if (!agent) return;
		try {
			await navigator.clipboard.writeText(agent.id);
		} catch {
			const textArea = document.createElement("textarea");
			textArea.value = agent.id;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
		}
		setAgentIdCopied(true);
		if (agentIdCopiedTimerRef.current)
			clearTimeout(agentIdCopiedTimerRef.current);
		agentIdCopiedTimerRef.current = setTimeout(
			() => setAgentIdCopied(false),
			2000,
		);
	};

	// Activity feed derived from real URL/file records and the agent's error state.
	const activity: ActivityEntry[] = [];
	for (const u of recentUrls) {
		const timeStr = u.last_fetch_at || u.updated_at;
		if (!timeStr) continue;
		activity.push({
			id: `url-${u.id}`,
			icon: (
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="2" y1="12" x2="22" y2="12" />
					<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
				</svg>
			),
			tone: "tertiary",
			text: t("labels.sourceCrawled"),
			highlight: u.title || u.url,
			time: new Date(timeStr),
		});
	}
	for (const f of recentFiles) {
		activity.push({
			id: `file-${f.id}`,
			icon: (
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
			),
			tone: "primary",
			text: t("labels.fileAdded"),
			highlight: f.filename,
			time: new Date(f.created_at),
		});
	}
	if (agent?.last_error_code) {
		activity.push({
			id: `err-${agent.id}`,
			icon: (
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			),
			tone: "error",
			text: t("dashboard.agentError"),
			time: agent.last_error_at ? new Date(agent.last_error_at) : new Date(),
		});
	}
	activity.sort((a, b) => b.time.getTime() - a.time.getTime());
	const activityFeed = activity.slice(0, 6);

	const totalSources =
		(sourcesSummary?.urls.total ?? 0) + (sourcesSummary?.files.total ?? 0);
	const readyBlocks =
		sourcesSummary === null ? null : sourcesSummary.urls.indexed + sourcesSummary.files.ready;

	const toneStyle: Record<ActivityEntry["tone"], React.CSSProperties> = {
		primary: { background: "rgba(67,67,213,0.08)", color: "var(--color-accent-primary)" },
		tertiary: { background: "rgba(0,101,92,0.08)", color: "var(--color-success)" },
		error: { background: "rgba(186,26,26,0.08)", color: "var(--color-error)" },
		neutral: { background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" },
	};

	return (
		<AdminLayout>
			<div
				style={{
					position: "relative",
					minHeight: "60vh",
				}}
			>
				{/* Background shader wash — Dashboard hero band only */}
				<Suspense fallback={null}>
					<DashboardShader />
				</Suspense>

				<div
					style={{
						padding: isMobile ? "var(--space-4)" : "var(--space-8)",
						maxWidth: "1440px",
						margin: "0 auto",
						position: "relative",
						zIndex: 1,
					}}
				>
				{/* Header — Stitch Overview */}
				<header
					style={{
						marginBottom: "var(--space-8)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: isMobile ? "flex-start" : "center",
						gap: "var(--space-3)",
						flexDirection: isMobile ? "column" : "row",
					}}
				>
					<div>
						<h1
							style={{
								fontSize: isMobile ? "var(--text-3xl)" : "var(--type-display-size)",
								lineHeight: isMobile ? undefined : "var(--type-display-line)",
								fontWeight: 700,
								letterSpacing: "-0.02em",
								color: "var(--color-text-primary)",
								marginBottom: "var(--space-2)",
							}}
						>
							{isMobile ? (
								<>
									{getGreeting()}, {admin?.name}
								</>
							) : (
								t("dashboard.overviewTitle")
							)}
						</h1>
						<p style={{ fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
							{isMobile
								? t("dashboard.mobileSubtitle")
								: t("dashboard.overviewSubtitle")}
						</p>
					</div>
					{!isMobile && (
						<span
							className="badge badge-neutral"
							style={{ padding: "8px 14px", fontSize: "var(--text-xs)" }}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="4" width="18" height="18" rx="2" />
								<line x1="16" y1="2" x2="16" y2="6" />
								<line x1="8" y1="2" x2="8" y2="6" />
								<line x1="3" y1="10" x2="21" y2="10" />
							</svg>
							{t("dashboard.last7Days")}
						</span>
					)}
				</header>

				{loadError && (
					<div
						className="animate-fade-in"
						style={{
							padding: "var(--space-3) var(--space-4)",
							borderRadius: "var(--radius-md)",
							background: "var(--color-error-bg)",
							border: "1px solid rgba(186,26,26,0.25)",
							color: "var(--color-error)",
							fontSize: "var(--text-sm)",
							marginBottom: "var(--space-6)",
						}}
						role="alert"
					>
						{t("errors.loadFailed")}：{loadError}
					</div>
				)}

				{/* Stat cards */}
				<div
					className="responsive-grid-3"
					style={{
						display: "grid",
						gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
						gap: "var(--space-4)",
						marginBottom: "var(--space-6)",
					}}
				>
					{loading ? (
						<>
							<div className="skeleton" style={{ height: "128px" }} />
							<div className="skeleton" style={{ height: "128px" }} />
							<div className="skeleton" style={{ height: "128px" }} />
						</>
					) : (
						<>
							<StatCard
								label={t("labels.activeSessions")}
								value={agent?.active_session_count ?? 0}
								icon={
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
										<line x1="8" y1="9" x2="16" y2="9" />
										<line x1="8" y1="13" x2="13" y2="13" />
									</svg>
								}
								iconTone="primary"
								badge={
									(() => {
										const today = sessionBuckets[6];
										const yesterday = sessionBuckets[5];
										if (today === 0 && yesterday === 0) return undefined;
										if (yesterday === 0)
											return { tone: "success" as const, text: `+${today} ${t("dashboard.vsYesterday")}` };
										const pct = Math.round(((today - yesterday) / yesterday) * 100);
										return pct >= 0
											? { tone: "success" as const, text: `+${pct}% ${t("dashboard.vsYesterday")}` }
											: { tone: "error" as const, text: `${pct}% ${t("dashboard.vsYesterday")}` };
									})()
								}
							/>
							<StatCard
								label={t("labels.knowledgeSources")}
								value={totalSources}
								icon={
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<ellipse cx="12" cy="5" rx="9" ry="3" />
										<path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
										<path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
									</svg>
								}
								iconTone="tertiary"
								badge={totalSources > 0 ? { tone: "neutral", text: t("labels.stable") } : undefined}
							/>
							<StatCard
								label={t("labels.readyContentBlocks")}
								value={readyBlocks ?? "-"}
								icon={
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
										<polyline points="14 2 14 8 20 8" />
										<polyline points="9 15 12 12 15 15" />
										<line x1="12" y1="12" x2="12" y2="18" />
									</svg>
								}
								iconTone="primary"
								badge={
									(readyBlocks ?? 0) > 0
										? { tone: "success", text: t("status.indexedBadge") }
										: undefined
								}
							/>
						</>
					)}
				</div>

				{/* Session Volume + Activity Feed — Stitch Overview layout */}
				<div
					className="responsive-grid-2"
					style={{
						display: "grid",
						gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 2fr) minmax(300px, 1fr)",
						gap: "var(--space-4)",
						marginBottom: "var(--space-6)",
						alignItems: "stretch",
					}}
				>
					{/* Session Volume — 7-day bar chart from real session data */}
					<section className="liquid-glass-card" style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column" }}>
						<h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-5)" }}>
							{t("dashboard.sessionVolume")}
						</h2>
						<div
							style={{
								flex: 1,
								minHeight: "220px",
								background: "var(--color-bg-tertiary)",
								border: "1px solid var(--color-border)",
								borderRadius: "var(--radius-md)",
								padding: "var(--space-4)",
								display: "flex",
								alignItems: "flex-end",
								gap: "var(--space-3)",
							}}
						>
							{sessionBuckets.map((count, i) => {
								const max = Math.max(...sessionBuckets, 1);
								const pct = Math.round((count / max) * 100);
								const dayLabel = dayLabels[i] || "";
								return (
									<div
										key={i}
										style={{
											flex: 1,
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											gap: "var(--space-2)",
											height: "100%",
											justifyContent: "flex-end",
										}}
										title={`${dayLabel}: ${count}`}
									>
										<span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
											{count}
										</span>
										<div
											style={{
												width: "100%",
												maxWidth: "48px",
												height: `${Math.max(pct, 3)}%`,
												minHeight: "6px",
												background: i === 6 ? "var(--color-accent-primary)" : "rgba(67, 67, 213, 0.25)",
												borderRadius: "6px 6px 2px 2px",
												transition: "height var(--transition-slow)",
											}}
										/>
										<span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
											{dayLabel}
										</span>
									</div>
								);
							})}
						</div>
					</section>

					{/* Activity feed */}
					<section
						className="liquid-glass-card"
						style={{
							padding: "var(--space-6)",
							maxHeight: "420px",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-4)" }}>
							{t("labels.recentActivity")}
						</h2>
						{activityFeed.length === 0 ? (
							<div
								style={{
									flex: 1,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									textAlign: "center",
									color: "var(--color-text-muted)",
									fontSize: "var(--text-sm)",
									padding: "var(--space-6)",
								}}
							>
								{loading ? (
									<div className="skeleton" style={{ width: "100%", height: "80px" }} />
								) : (
									t("labels.noRecentActivity")
								)}
							</div>
						) : (
							<div
								style={{
									flex: 1,
									overflowY: "auto",
									display: "flex",
									flexDirection: "column",
									gap: "var(--space-4)",
									paddingRight: "var(--space-1)",
								}}
							>
								{activityFeed.map((entry) => (
									<div key={entry.id} style={{ display: "flex", gap: "var(--space-3)" }}>
										<div
											style={{
												width: "30px",
												height: "30px",
												borderRadius: "var(--radius-full)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0,
												marginTop: "2px",
												...toneStyle[entry.tone],
											}}
										>
											{entry.icon}
										</div>
										<div style={{ minWidth: 0 }}>
											<p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
												{entry.text}{" "}
												{entry.highlight && (
													<span style={{ fontWeight: 500, wordBreak: "break-all" }}>
														{entry.highlight}
													</span>
												)}
											</p>
											<p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
												{formatRelativeTime(entry.time)}
											</p>
										</div>
									</div>
								))}
							</div>
						)}
						<button
							onClick={() =>
								navigate(
									routeAgentId ? `/agents/${routeAgentId}/sessions` : "/sessions",
								)
							}
							className="btn-secondary"
							style={{ marginTop: "var(--space-4)", width: "100%", flexShrink: 0 }}
						>
							{t("dashboard.viewAllActivity")}
						</button>
					</section>
				</div>

				{/* Knowledge coverage split bars — real counts only */}
				<section className="liquid-glass-card" style={{ padding: "var(--space-6)", marginBottom: "var(--space-6)" }}>
					<h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-5)" }}>
						{t("labels.knowledgeCoverage")}
					</h2>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
							gap: "var(--space-6)",
						}}
					>
						{[
							{
								key: "urls",
								label: t("dashboard.coverageUrls"),
								total: sourcesSummary?.urls.total ?? 0,
								done: sourcesSummary?.urls.indexed ?? 0,
							},
							{
								key: "files",
								label: t("dashboard.coverageFiles"),
								total: sourcesSummary?.files.total ?? 0,
								done: sourcesSummary?.files.ready ?? 0,
							},
						].map((row) => {
							const pct =
								row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
							return (
								<div key={row.key} style={{ marginBottom: "var(--space-2)" }}>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											fontSize: "var(--text-sm)",
											marginBottom: "var(--space-2)",
										}}
									>
										<span style={{ fontWeight: 500 }}>{row.label}</span>
										<span style={{ color: "var(--color-text-muted)" }}>
											{row.key === "urls"
												? t("labels.indexedOf", {
														indexed: String(row.done),
														total: String(row.total),
													})
												: t("labels.readyOf", {
														ready: String(row.done),
														total: String(row.total),
													})}
										</span>
									</div>
									<div
										style={{
											height: "8px",
											background: "var(--color-surface-container-high)",
											borderRadius: "999px",
											overflow: "hidden",
										}}
									>
										<div
											style={{
												height: "100%",
												width: `${pct}%`,
												background: "var(--color-accent-primary)",
												borderRadius: "999px",
												transition: "width var(--transition-slow)",
											}}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</section>

				{/* System status — flat card */}
				<section className="liquid-glass-card" style={{ padding: isMobile ? "var(--space-4)" : "var(--space-6)", marginBottom: "var(--space-6)" }}>
					<h2 style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "var(--space-5)", color: "var(--color-text-secondary)", fontSize: "var(--text-xs)" }}>
						{t("labels.systemStatus")}
					</h2>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
							gap: "var(--space-6)",
						}}
					>
						{/* Vector index status */}
						<div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
							<span
								className={`status-dot ${sourcesSummary && (sourcesSummary.urls.indexed > 0 || sourcesSummary.files.ready > 0) ? "status-dot-active" : "status-dot-away"}`}
							/>
							<div>
								<div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
									{t("labels.vectorIndex")}
								</div>
								<div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
									{sourcesSummary &&
									(sourcesSummary.urls.indexed > 0 ||
										sourcesSummary.files.ready > 0)
										? t("status.established")
										: t("status.notEstablished")}
								</div>
							</div>
						</div>

						{/* API status */}
						<div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
							<span className="status-dot status-dot-active" />
							<div>
								<div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
									{t("labels.apiStatus")}
								</div>
								<div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
									{t("labels.normalOperation")}
								</div>
							</div>
						</div>

						{/* Agent status */}
						<div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
							<span
								className={`status-dot ${agent ? "status-dot-active" : "status-dot-offline"}`}
							/>
							<div style={{ minWidth: 0 }}>
								<div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
									Agent
								</div>
								<div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
									{agent ? t("status.configured") : t("status.notConfigured")}
								</div>
								{agent && (
									<button
										onClick={handleCopyAgentId}
										style={{
											marginTop: "4px",
											padding: 0,
											border: "none",
											background: "transparent",
											cursor: "pointer",
											fontSize: "var(--text-xs)",
											color: agentIdCopied
												? "var(--color-success)"
												: "var(--color-text-muted)",
											fontFamily: "var(--font-mono)",
											textAlign: "left",
											wordBreak: "break-all",
											transition: "color var(--transition-fast)",
										}}
										title={agentIdCopied ? t("status.success") : t("buttons.copy")}
									>
										{agentIdCopied
											? `${t("status.success")}: ${agent.id}`
											: `ID: ${agent.id}`}
									</button>
								)}
							</div>
						</div>
					</div>
				</section>

				{/* Quick actions */}
				<section>
					<h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-4)" }}>
						{t("labels.quickStart")}
					</h2>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: isMobile
								? "1fr"
								: "repeat(auto-fit, minmax(280px, 1fr))",
							gap: "var(--space-4)",
						}}
					>
						{[
							{
								titleKey: "navigation.playground",
								descriptionKey: "labels.testAiEffect",
								path: "/playground",
								icon: (
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
									</svg>
								),
								tone: "primary" as const,
							},
							{
								titleKey: "navigation.fileManagement",
								descriptionKey: "labels.manageFiles",
								path: "/files",
								icon: (
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
										<polyline points="14 2 14 8 20 8" />
									</svg>
								),
								tone: "tertiary" as const,
							},
							{
								titleKey: "navigation.urlKnowledge",
								descriptionKey: "labels.addWebKnowledge",
								path: "/urls",
								icon: (
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
										<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
									</svg>
								),
								tone: "secondary" as const,
							},
						].map((action) => (
							<button
								key={action.path}
								onClick={() =>
									navigate(
										routeAgentId
											? `/agents/${routeAgentId}${action.path}`
											: action.path,
									)
								}
								className="btn-secondary"
								style={{
									display: "flex",
									alignItems: "center",
									gap: "var(--space-4)",
									padding: "var(--space-5)",
									textAlign: "left",
									width: "100%",
									justifyContent: "flex-start",
								}}
							>
								<span
									style={{
										width: "42px",
										height: "42px",
										borderRadius: "var(--radius-lg)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
										...(action.tone === "primary"
											? { background: "rgba(67,67,213,0.08)", color: "var(--color-accent-primary)" }
											: action.tone === "tertiary"
												? { background: "rgba(0,101,92,0.08)", color: "var(--color-success)" }
												: { background: "rgba(174,47,52,0.08)", color: "var(--color-secondary)" }),
									}}
								>
									{action.icon}
								</span>
								<span style={{ flex: 1, minWidth: 0 }}>
									<span
										style={{
											display: "block",
											fontSize: "var(--text-sm)",
											fontWeight: 600,
											color: "var(--color-text-primary)",
										}}
									>
										{t(action.titleKey)}
									</span>
									<span
										style={{
											display: "block",
											fontSize: "var(--text-xs)",
											color: "var(--color-text-muted)",
											marginTop: "2px",
										}}
									>
										{t(action.descriptionKey)}
									</span>
								</span>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
								>
									<path d="M9 18l6-6-6-6" />
								</svg>
							</button>
						))}
					</div>
				</section>
				</div>
			</div>
		</AdminLayout>
	);
}
