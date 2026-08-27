"use client";

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

export const Login = () => {
	const { t } = useTranslation("auth");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [bootstrapRequired, setBootstrapRequired] = useState(false);
	const { login } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		fetch("/api/admin/registration-settings")
			.then((res) => res.json())
			.then((data) => {
				const required = Boolean(data.bootstrap_required);
				setBootstrapRequired(required);
				if (required) {
					navigate("/register");
				}
			})
			.catch(() => setBootstrapRequired(false));
	}, [navigate]);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			await login(email, password);
			navigate("/");
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : t("errors.loginFailed");
			setError(message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div
			suppressHydrationWarning
			style={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "var(--space-6)",
				position: "relative",
			}}
		>
			{/* Liquid blob background */}

			<div
				style={{
					width: "100%",
					maxWidth: "420px",
					animation: "fadeIn 0.6s cubic-bezier(0.25, 1.1, 0.5, 1.15) forwards",
				}}
			>
				{/* Logo & title */}
				<div
					style={{
						textAlign: "center",
						marginBottom: "var(--space-10)",
					}}
				>
					<div
						style={{
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: "80px",
							height: "80px",
							marginBottom: "var(--space-6)",
							borderRadius: "var(--radius-xl)",
							background: "var(--color-accent-primary)",
							color: "#ffffff",
						}}
					>
						<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<rect x="4" y="8" width="16" height="12" rx="3" />
							<line x1="12" y1="4" x2="12" y2="8" />
							<circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
							<line x1="9" y1="13" x2="9" y2="14" />
							<line x1="15" y1="13" x2="15" y2="14" />
							<path d="M9.5 17.5h5" />
						</svg>
					</div>
					<h1
						style={{
							fontSize: "var(--text-3xl)",
							fontWeight: 700,
							marginBottom: "var(--space-3)",
							background:
								"var(--color-accent-primary)",
							WebkitBackgroundClip: "text",
							backgroundClip: "text",
							WebkitTextFillColor: "transparent",
						}}
					>
						Aurelia AI
					</h1>
					<p
						style={{
							color: "var(--color-text-secondary)",
							fontSize: "var(--text-base)",
						}}
					>
						{t("login.subtitle")}
					</p>
				</div>

				{/* Login form card */}
				<div
					className="liquid-glass-card"
					style={{
						padding: "var(--space-8)",
					}}
				>
					{error && (
						<div
							style={{
								background: "var(--color-error-bg)",
								color: "var(--color-error)",
								padding: "var(--space-4)",
								borderRadius: "var(--radius-md)",
								marginBottom: "var(--space-6)",
								fontSize: "var(--text-sm)",
								display: "flex",
								alignItems: "center",
								gap: "var(--space-3)",
								border: "1px solid hsla(350deg, 85%, 58%, 0.2)",
							}}
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
							{error}
						</div>
					)}

					<form onSubmit={handleLogin} suppressHydrationWarning>
						<div style={{ marginBottom: "var(--space-5)" }}>
							<label
								style={{
									display: "block",
									marginBottom: "var(--space-2)",
									fontSize: "var(--text-sm)",
									fontWeight: 500,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("login.email")}
							</label>
							<div suppressHydrationWarning style={{ position: "relative" }}>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder={t("login.emailPlaceholder")}
									required
									disabled={loading}
									autoComplete="email"
									suppressHydrationWarning
									style={{
										paddingLeft: "var(--space-12)",
									}}
								/>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									style={{
										position: "absolute",
										left: "var(--space-4)",
										top: "50%",
										transform: "translateY(-50%)",
										color: "var(--color-text-muted)",
									}}
								>
									<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
									<polyline points="22,6 12,13 2,6" />
								</svg>
							</div>
						</div>

						<div style={{ marginBottom: "var(--space-6)" }}>
							<label
								style={{
									display: "block",
									marginBottom: "var(--space-2)",
									fontSize: "var(--text-sm)",
									fontWeight: 500,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("login.password")}
							</label>
							<div suppressHydrationWarning style={{ position: "relative" }}>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder={t("login.passwordPlaceholder")}
									required
									disabled={loading}
									autoComplete="current-password"
									data-1p-ignore
									data-lpignore="true"
									data-bwignore
									suppressHydrationWarning
									style={{
										paddingLeft: "var(--space-12)",
									}}
								/>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									style={{
										position: "absolute",
										left: "var(--space-4)",
										top: "50%",
										transform: "translateY(-50%)",
										color: "var(--color-text-muted)",
									}}
								>
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 10 0v4" />
								</svg>
							</div>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="btn-primary"
							style={{
								width: "100%",
								padding: "var(--space-4)",
								fontSize: "var(--text-base)",
							}}
						>
							{loading ? (
								<>
									<div className="spinner" />
									{t("login.loginInProgress")}
								</>
							) : (
								<>
									{t("login.loginButton")}
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M5 12h14M12 5l7 7-7 7" />
									</svg>
								</>
							)}
						</button>
					</form>
				</div>

			{bootstrapRequired && (
				<p
					style={{
						textAlign: "center",
						marginTop: "var(--space-6)",
						color: "var(--color-text-secondary)",
						fontSize: "var(--text-sm)",
					}}
				>
					{t("login.setupPrompt")}{" "}
					<Link
						to="/register"
						style={{
							color: "var(--color-accent-primary)",
							fontWeight: 500,
							textDecoration: "none",
							transition: "color var(--transition-fast)",
						}}
					>
						{t("login.setupLink")}
					</Link>
				</p>
			)}

			<p
				style={{
					textAlign: "center",
					marginTop: "var(--space-6)",
					color: "var(--color-text-secondary)",
					fontSize: "var(--text-sm)",
				}}
			>
				{t("login.noAccount")}{" "}
				<Link
					to="/register"
					style={{
						color: "var(--color-accent-primary)",
						fontWeight: 600,
						textDecoration: "none",
						transition: "color var(--transition-fast)",
					}}
				>
					{t("login.signUpLink")}
				</Link>
			</p>

				<div
					style={{
						textAlign: "center",
						marginTop: "var(--space-10)",
						paddingTop: "var(--space-6)",
						borderTop: "1px solid var(--color-border)",
					}}
				>
					<p
						style={{
							fontSize: "var(--text-xs)",
							color: "var(--color-text-muted)",
						}}
					>
						{t("login.footer")}
					</p>
				</div>
			</div>
		</div>
	);
};
