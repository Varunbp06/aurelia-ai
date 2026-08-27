"use client";

import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";

import {
	useIsMobile,
	useIsTablet,
} from "../hooks/useMediaQuery";

interface AdminLayoutProps {
	children: ReactNode;
}

interface NavItem {
	path: string;
	i18nKey: string;
	icon: JSX.Element;
	children?: NavItem[];
}

const navItemsConfig: NavItem[] = [
	{
		path: "/",
		i18nKey: "navigation.dashboard",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<rect x="3" y="3" width="7" height="7" rx="1" />
				<rect x="14" y="3" width="7" height="7" rx="1" />
				<rect x="14" y="14" width="7" height="7" rx="1" />
				<rect x="3" y="14" width="7" height="7" rx="1" />
			</svg>
		),
	},
	{
		path: "/playground",
		i18nKey: "navigation.playground",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
		),
	},
	{
		path: "/agents",
		i18nKey: "navigation.agents",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M12 2v4" />
				<path d="M12 18v4" />
				<rect x="4" y="6" width="16" height="12" rx="3" />
				<path d="M8 12h.01" />
				<path d="M16 12h.01" />
				<path d="M9 16h6" />
			</svg>
		),
	},
	{
		path: "/knowledge",
		i18nKey: "navigation.knowledge",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
				<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
			</svg>
		),
		children: [
			{
				path: "/urls",
				i18nKey: "navigation.websites",
				icon: (
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</svg>
				),
			},
			{
				path: "/files",
				i18nKey: "navigation.files",
				icon: (
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
				),
			},
		],
	},
	{
		path: "/sessions",
		i18nKey: "navigation.sessions",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
		),
	},
	{
		path: "/users",
		i18nKey: "navigation.users",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M19 8v6" />
				<path d="M22 11h-6" />
			</svg>
		),
	},
	{
		path: "/settings/agent",
		i18nKey: "navigation.agentSettings",
		icon: (
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
			</svg>
		),
	},
];

export default function AdminLayout({ children }: AdminLayoutProps) {
	const { t } = useTranslation("common");
	const location = useLocation();
	const navigate = useNavigate();
	const { agentId } = useParams<{ agentId?: string }>();
	const { admin, logout } = useAuth();
	const isMobile = useIsMobile();
	const isTablet = useIsTablet();
	const iconOnly = isTablet;
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [agentName, setAgentName] = useState<string | null>(null);
	const isSuperAdmin = admin?.role === "super_admin";
	const isSupport = admin?.role === "support";
	const agentBasePath = agentId ? `/agents/${agentId}` : "";

	// Build nav items based on role and context
	const scopedNavItems = agentId
		? navItemsConfig
				.filter((item) => item.path !== "/agents")
				.map((item) => ({
					...item,
					path:
						item.path === "/"
							? `${agentBasePath}/dashboard`
							: `${agentBasePath}${item.path}`,
					children: item.children?.map((child) => ({
						...child,
						path: `${agentBasePath}${child.path}`,
					})),
				}))
		: isSuperAdmin
			? navItemsConfig.filter(
					(item) => item.path === "/" || item.path === "/agents",
				)
			: []; // Non-super users at root level should redirect, show no nav

	const allowedNav =
		isSupport && agentId
			? scopedNavItems.filter(
					(item) => item.path === `${agentBasePath}/sessions`,
				)
			: scopedNavItems;

	const navItems = allowedNav.map((item) => ({
		...item,
		label: t(item.i18nKey),
	}));

	// Mobile bottom tab bar items (real routes only)
	const bottomTabs = (() => {
		if (isSupport && agentId) {
			return [
				{
					path: `${agentBasePath}/sessions`,
					label: t("navigation.sessions"),
					icon: navItemsConfig.find((n) => n.path === "/sessions")?.icon,
				},
			];
		}
		if (agentId) {
			return [
				{
					path: `${agentBasePath}/dashboard`,
					label: t("navigation.dashboard"),
					icon: navItemsConfig.find((n) => n.path === "/")?.icon,
				},
				{
					path: `${agentBasePath}/sessions`,
					label: t("navigation.sessions"),
					icon: navItemsConfig.find((n) => n.path === "/sessions")?.icon,
				},
				{
					path: agentBasePath,
					label: t("navigation.agents"),
					icon: navItemsConfig.find((n) => n.path === "/agents")?.icon,
				},
				{
					path: `${agentBasePath}/settings/agent`,
					label: t("navigation.agentSettings"),
					icon: navItemsConfig.find((n) => n.path === "/settings/agent")?.icon,
				},
			];
		}
		if (isSuperAdmin) {
			return [
				{ path: "/", label: t("navigation.dashboard"), icon: navItemsConfig.find((n) => n.path === "/")?.icon },
				{ path: "/sessions", label: t("navigation.sessions"), icon: navItemsConfig.find((n) => n.path === "/sessions")?.icon },
				{ path: "/agents", label: t("navigation.agents"), icon: navItemsConfig.find((n) => n.path === "/agents")?.icon },
				{ path: "/settings/agent", label: t("navigation.agentSettings"), icon: navItemsConfig.find((n) => n.path === "/settings/agent")?.icon },
			];
		}
		return [];
	})();

	// Auto-expand knowledge group when child route is active
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
		const knowledgePath = agentId ? `${agentBasePath}/knowledge` : "/knowledge";
		if (
			location.pathname === knowledgePath ||
			location.pathname === `${agentBasePath}/urls` ||
			location.pathname === `${agentBasePath}/files`
		) {
			return new Set([knowledgePath]);
		}
		return new Set();
	});

	useEffect(() => {
		const knowledgePath = agentId ? `${agentBasePath}/knowledge` : "/knowledge";
		if (
			location.pathname === knowledgePath ||
			location.pathname === `${agentBasePath}/urls` ||
			location.pathname === `${agentBasePath}/files`
		) {
			setExpandedGroups((prev) => new Set([...prev, knowledgePath]));
		}
	}, [agentBasePath, agentId, location.pathname]);

	const isActive = (item: NavItem) => {
		if (item.path === location.pathname) return true;
		if (item.children) {
			return item.children.some((child) => child.path === location.pathname);
		}
		return false;
	};

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	const handleNavClick = () => {
		if (isMobile) {
			setSidebarOpen(false);
		}
	};

	const handleLogoClick = () => {
		if (isMobile) {
			setSidebarOpen(false);
		}
	};

	// Active-item left edge indicator tracking
	const navRef = useRef<HTMLDivElement>(null);
	const [indicatorStyle, setIndicatorStyle] = useState<{
		top: number;
		height: number;
	}>({ top: 0, height: 0 });

	const updateIndicator = useCallback(() => {
		if (!navRef.current) return;
		const activeEl = navRef.current.querySelector(
			'[data-nav-active="true"]',
		) as HTMLElement | null;
		if (activeEl) {
			const navRect = navRef.current.getBoundingClientRect();
			const elRect = activeEl.getBoundingClientRect();
			setIndicatorStyle({
				top: elRect.top - navRect.top,
				height: elRect.height,
			});
		} else {
			setIndicatorStyle({ top: 0, height: 0 });
		}
	}, []);

	useEffect(() => {
		updateIndicator();
	}, [location.pathname, updateIndicator]);

	// Re-measure after expand/collapse animations
	useEffect(() => {
		const timer = setTimeout(updateIndicator, 350);
		return () => clearTimeout(timer);
	}, [expandedGroups, updateIndicator]);

	useEffect(() => {
		if (!agentId) {
			setAgentName(null);
			return;
		}

		let cancelled = false;
		setAgentName(null);

		api
			.getAgent(agentId)
			.then((agent) => {
				if (!cancelled) {
					setAgentName(agent.name);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setAgentName(null);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [agentId]);

	const canCreateAgents = isSuperAdmin && !isSupport;

	const SidebarContent = () => (
		<>
			{/* Logo */}
			<div
				style={{
					padding: iconOnly ? "var(--space-4) var(--space-3)" : "var(--space-6)",
					borderBottom: "1px solid var(--color-border)",
				}}
			>
				<Link
					to={
						isSuperAdmin
							? "/"
							: agentId
								? isSupport
									? `${agentBasePath}/sessions`
									: `${agentBasePath}/dashboard`
								: "/agent-selector"
					}
					style={{
						textDecoration: "none",
						display: "flex",
						alignItems: "center",
						gap: "var(--space-3)",
						justifyContent: iconOnly ? "center" : "flex-start",
					}}
					onClick={handleLogoClick}
				>
				<div
					style={{
						width: "36px",
						height: "36px",
						borderRadius: "var(--radius-md)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						overflow: "hidden",
						background: "var(--color-accent-primary)",
						color: "var(--color-on-primary)",
						flexShrink: 0,
					}}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<rect x="4" y="8" width="16" height="12" rx="3" />
						<line x1="12" y1="4" x2="12" y2="8" />
						<circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
						<line x1="9" y1="13" x2="9" y2="14" />
						<line x1="15" y1="13" x2="15" y2="14" />
						<path d="M9.5 17.5h5" />
					</svg>
				</div>
					{!iconOnly && (
						<div style={{ minWidth: 0 }}>
							<h1
								style={{
									fontSize: "var(--text-base)",
									fontWeight: 700,
									color: "var(--color-text-primary)",
									letterSpacing: "-0.01em",
									lineHeight: 1.3,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{agentId ? agentName || t("status.loading") : t("appName")}
							</h1>
							<span
								style={{
									fontSize: "var(--text-xs)",
									color: "var(--color-text-muted)",
									whiteSpace: "nowrap",
								}}
							>
								{t("labels.adminConsole")}
							</span>
						</div>
					)}
				</Link>
			</div>

			{agentId && !iconOnly && (
				<div
					style={{
						padding: "var(--space-4) var(--space-6)",
						borderBottom: "1px solid var(--color-border)",
					}}
				>
					<Link
						to="/"
						onClick={handleLogoClick}
						className="btn-secondary"
						style={{
							display: "block",
							fontSize: "var(--text-sm)",
							padding: "var(--space-2) var(--space-3)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							textDecoration: "none",
							textAlign: "left",
						}}
					>
						← {t("agents.panelTitle")}
					</Link>
				</div>
			)}

			{/* New Agent */}
			{canCreateAgents && !iconOnly && (
				<div style={{ padding: "var(--space-4) var(--space-4) 0" }}>
					<button
						onClick={() => {
							navigate("/agents");
							handleNavClick();
						}}
						className="btn-primary"
						style={{ width: "100%", fontSize: "var(--text-xs)" }}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						{t("navigation.newAgent")}
					</button>
				</div>
			)}

			{/* Navigation */}
			<nav
				style={{
					flex: 1,
					padding: iconOnly ? "var(--space-3) var(--space-2)" : "var(--space-4)",
					overflowY: "auto",
					overflowX: "hidden",
				}}
			>
				<div
					ref={navRef}
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "2px",
						position: "relative",
					}}
				>
					{/* 3px active edge indicator */}
					{indicatorStyle.height > 0 && (
						<div
							style={{
								position: "absolute",
								left: 0,
								top: `${indicatorStyle.top}px`,
								height: `${indicatorStyle.height}px`,
								width: "3px",
								background: "var(--color-accent-primary)",
								borderRadius: "0 2px 2px 0",
								transition:
									"top 200ms ease-out, height 200ms ease-out",
								pointerEvents: "none",
								zIndex: 2,
							}}
						/>
					)}

					{navItems.map((item) => {
						const hasChildren = item.children && item.children.length > 0;
						const isExpanded = expandedGroups.has(item.path);
						const active = isActive(item);

						return (
							<div key={item.path} style={{ position: "relative", zIndex: 1 }}>
								<div style={{ display: "flex", alignItems: "center" }}>
									<Link
										to={item.path}
										data-nav-active={active ? "true" : undefined}
										title={iconOnly ? item.label : undefined}
										onClick={() => {
											if (hasChildren) {
												setExpandedGroups(
													(prev) => new Set([...prev, item.path]),
												);
											}
											handleNavClick();
										}}
										style={{
											flex: 1,
											minWidth: 0,
											display: "flex",
											alignItems: "center",
											gap: "var(--space-3)",
											padding: iconOnly
												? "var(--space-3)"
												: "var(--space-2) var(--space-4)",
											marginLeft: "3px",
											borderRadius: "var(--radius-md)",
											color: active
												? "var(--color-accent-primary)"
												: "var(--color-on-surface-variant)",
											background: active
												? "var(--color-accent-soft)"
												: "transparent",
											textDecoration: "none",
											fontSize: "var(--text-sm)",
											fontWeight: active ? 600 : 400,
											justifyContent: iconOnly ? "center" : "flex-start",
											transition:
												"color var(--transition-fast), background var(--transition-fast)",
											position: "relative",
										}}
									>
										<span
											style={{
												display: "flex",
												opacity: active ? 1 : 0.75,
												transition: "opacity var(--transition-fast)",
												flexShrink: 0,
											}}
										>
											{item.icon}
										</span>
										{!iconOnly && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>}
									</Link>
									{hasChildren && !iconOnly && (
										<button
											onClick={(e) => {
												e.preventDefault();
												setExpandedGroups((prev) => {
													const next = new Set(prev);
													if (next.has(item.path)) {
														next.delete(item.path);
													} else {
														next.add(item.path);
													}
													return next;
												});
											}}
											aria-label={isExpanded ? "Collapse" : "Expand"}
											style={{
												padding: "var(--space-2)",
												background: "transparent",
												cursor: "pointer",
												color: "var(--color-text-muted)",
												display: "flex",
												alignItems: "center",
												borderRadius: "var(--radius-sm)",
												transition: "color var(--transition-fast)",
											}}
										>
											<svg
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												style={{
													transform: isExpanded
														? "rotate(90deg)"
														: "rotate(0deg)",
													transition: "transform 200ms ease-out",
												}}
											>
												<polyline points="9 18 15 12 9 6" />
											</svg>
										</button>
									)}
								</div>

								{hasChildren && isExpanded && !iconOnly && (
									<div
										style={{
											marginLeft: "var(--space-4)",
											overflow: "hidden",
										}}
									>
										{item.children!.map((child) => {
											const childActive = location.pathname === child.path;
											return (
												<Link
													key={child.path}
													to={child.path}
													onClick={handleNavClick}
													title={t(child.i18nKey)}
													style={{
														display: "flex",
														alignItems: "center",
														gap: "var(--space-3)",
														padding: "var(--space-2) var(--space-4)",
														paddingLeft: "var(--space-10)",
														borderRadius: "var(--radius-md)",
														color: childActive
															? "var(--color-accent-primary)"
															: "var(--color-on-surface-variant)",
														background: childActive
															? "var(--color-accent-soft)"
															: "transparent",
														textDecoration: "none",
														fontSize: "var(--text-sm)",
														fontWeight: childActive ? 500 : 400,
														transition: "all var(--transition-fast)",
														position: "relative",
													}}
												>
													{childActive && (
														<div
															style={{
																position: "absolute",
																left: "12px",
																top: "50%",
																transform: "translateY(-50%)",
																width: "4px",
																height: "4px",
																borderRadius: "50%",
																background: "var(--color-accent-primary)",
															}}
														/>
													)}
													<span
														style={{
															display: "flex",
															opacity: childActive ? 1 : 0.7,
															flexShrink: 0,
														}}
													>
														{child.icon}
													</span>
													{t(child.i18nKey)}
												</Link>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</nav>

			{/* Footer: Help Center + Log Out pinned at the bottom */}
			<div
				style={{
					padding: iconOnly ? "var(--space-3) var(--space-2)" : "var(--space-4)",
					borderTop: "1px solid var(--color-border)",
					display: "flex",
					flexDirection: "column",
					gap: "var(--space-1)",
				}}
			>
				<a
					href="#"
					target="_blank"
					rel="noopener noreferrer"
					title={t("labels.helpCenter")}
					style={{
						display: iconOnly ? "flex" : "inline-flex",
						alignItems: "center",
						justifyContent: iconOnly ? "center" : "flex-start",
						gap: "var(--space-3)",
						padding: "var(--space-2) var(--space-3)",
						borderRadius: "var(--radius-md)",
						color: "var(--color-on-surface-variant)",
						fontSize: "var(--text-sm)",
						textDecoration: "none",
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="10" />
						<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					</svg>
					{!iconOnly && t("labels.helpCenter")}
				</a>
				<button
					onClick={handleLogout}
					title={t("buttons.logout")}
					style={{
						width: "100%",
						display: "flex",
						alignItems: iconOnly ? "center" : "flex-start",
						justifyContent: iconOnly ? "center" : "flex-start",
						gap: "var(--space-3)",
						padding: "var(--space-2) var(--space-3)",
						background: "transparent",
						border: "none",
						borderRadius: "var(--radius-md)",
						color: "var(--color-on-surface-variant)",
						fontSize: "var(--text-sm)",
						cursor: "pointer",
						transition: "all var(--transition-fast)",
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
						<polyline points="16 17 21 12 16 7" />
						<line x1="21" y1="12" x2="9" y2="12" />
					</svg>
					{!iconOnly && t("buttons.logout")}
				</button>

				{!iconOnly && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "var(--space-3)",
							padding: "var(--space-3)",
							background: "var(--sidebar-user-bg)",
							border: "1px solid var(--color-border)",
							borderRadius: "var(--radius-lg)",
							marginTop: "var(--space-2)",
						}}
					>
						<div
							style={{
								width: "34px",
								height: "34px",
								background: "var(--color-info-bg)",
								color: "var(--color-accent-primary)",
								borderRadius: "var(--radius-full)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "var(--text-sm)",
								fontWeight: 600,
								flexShrink: 0,
							}}
						>
							{admin?.name?.charAt(0).toUpperCase() || "A"}
						</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									fontSize: "var(--text-sm)",
									fontWeight: 500,
									color: "var(--color-text-primary)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{admin?.name || t("navigation.administrator")}
							</div>
							<div
								style={{
									fontSize: "var(--text-xs)",
									color: "var(--color-text-muted)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{admin?.email}
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);

	return (
		<div
			style={{
				display: "flex",
				minHeight: "100vh",
				background: "var(--color-bg-primary)",
			}}
		>
			{/* Mobile Header */}
			{isMobile && (
				<header className="mobile-header">
					<button
						onClick={() => setSidebarOpen(true)}
						aria-label="Open menu"
						title="Open navigation menu"
						className="hamburger-btn"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							style={{ display: "block" }}
						>
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
					<Link to="/" style={{ textDecoration: "none" }}>
						<span
							style={{
								fontSize: "var(--text-base)",
								fontWeight: 700,
								color: "var(--color-accent-primary)",
								letterSpacing: "-0.01em",
							}}
						>
							{t("appName")}
						</span>
					</Link>
					<div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
						<div
							role="button"
							tabIndex={0}
							aria-label="Account menu"
							title={admin ? `${admin.name} — ${admin.email}` : "Account"}
							onClick={() => navigate(admin ? "/settings/agent" : "/login")}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									navigate(admin ? "/settings/agent" : "/login");
								}
							}}
							style={{
								width: "32px",
								height: "32px",
								borderRadius: "50%",
								background: "var(--color-info-bg)",
								border: "1px solid var(--color-border)",
								color: "var(--color-accent-primary)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: 600,
								cursor: "pointer",
							}}
						>
							{admin?.name?.charAt(0).toUpperCase() || "A"}
						</div>
					</div>
				</header>
			)}

			{/* Sidebar Overlay (Mobile) */}
			{isMobile && (
				<div
					className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			{/* Sidebar */}
			{isMobile ? (
				<aside
					className={`mobile-sidebar glass-sidebar ${sidebarOpen ? "open" : ""}`}
					style={{
						width: "var(--sidebar-width)",
						maxWidth: "84vw",
						display: "flex",
						flexDirection: "column",
					}}
				>
					<SidebarContent />
				</aside>
			) : (
				<aside
					className="glass-sidebar"
					style={{
						width: iconOnly ? "var(--sidebar-collapsed)" : "var(--sidebar-width)",
						display: "flex",
						flexDirection: "column",
						position: "fixed",
						top: 0,
						left: 0,
						bottom: 0,
						zIndex: 50,
					}}
				>
					<SidebarContent />
				</aside>
			)}

			<main
				className={isMobile ? "mobile-main" : ""}
				style={{
					flex: 1,
					marginLeft: isMobile ? 0 : iconOnly ? "var(--sidebar-collapsed)" : "var(--sidebar-width)",
					minHeight: "100vh",
					overflow: "auto",
					paddingBottom: isMobile ? "76px" : undefined,
				}}
			>
				{children}
			</main>

			{/* Mobile bottom tab bar */}
			{isMobile && bottomTabs.length > 0 && (
				<nav className="bottom-tabbar">
					{bottomTabs.map((tab) => {
						const active =
							tab.path === "/"
								? location.pathname === "/"
								: location.pathname.startsWith(tab.path);
						return (
							<Link
								key={tab.path}
								to={tab.path}
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "center",
									gap: "2px",
									flex: 1,
									textDecoration: "none",
									color: active
										? "var(--color-accent-primary)"
										: "var(--color-text-secondary)",
								}}
							>
								<span
									style={{
										display: "flex",
										padding: "2px 14px",
										borderRadius: "999px",
										background: active ? "var(--color-accent-soft)" : "transparent",
									}}
								>
									{tab.icon}
								</span>
								<span
									style={{
										fontSize: "10px",
										fontWeight: active ? 600 : 500,
									}}
								>
									{tab.label}
								</span>
							</Link>
						);
					})}
				</nav>
			)}

			{/* Floating action button — New Agent (mobile) */}
			{isMobile && canCreateAgents && (
				<button
					onClick={() => navigate("/agents")}
					aria-label={t("navigation.newAgent")}
					title={t("navigation.newAgent")}
					style={{
						position: "fixed",
						bottom: "80px",
						right: "16px",
						width: "52px",
						height: "52px",
						background: "var(--color-accent-primary)",
						color: "var(--color-text-inverse)",
						border: "none",
						borderRadius: "var(--radius-full)",
						boxShadow: "var(--shadow-lg)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 40,
					}}
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
			)}
		</div>
	);
}
