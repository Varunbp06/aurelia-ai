"use client";

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../lib/env";

export const Register = () => {
	const { t } = useTranslation("auth");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const { register } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		fetch(`${API_BASE_URL}/api/admin/registration-settings`)
			.then((res) => res.json())
			.then((data) => {
				if (!data.bootstrap_required && !data.public_registration_enabled) {
					navigate("/login", { replace: true });
				}
			})
			.catch(() => {
				// Settings endpoint unreachable — allow the form; backend still validates.
			});
	}, [navigate]);

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (password !== confirmPassword) {
			setError(t("errors.passwordMismatch"));
			return;
		}

		if (password.length < 8) {
			setError(t("errors.passwordTooShort"));
			return;
		}

		setLoading(true);
		try {
			await register(email, password, name);
			navigate("/", { replace: true });
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : t("errors.setupFailed");
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
						marginBottom: "var(--space-8)",
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
						{t("initialSetup.subtitle")}
					</p>
				</div>

				{/* Register form card */}
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

					<form onSubmit={handleRegister} suppressHydrationWarning>
						<div style={{ marginBottom: "var(--space-5)" }}>
							<label
								style={{
									display: "block",
									marginBottom: "var(--space-2)",
									fontSize: "var(--text-sm)",
									fontWeight: 600,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("initialSetup.name")}
							</label>
							<div suppressHydrationWarning style={{ position: "relative" }}>
								<input
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={t("initialSetup.namePlaceholder")}
									required
									disabled={loading}
									autoComplete="name"
									suppressHydrationWarning
									style={{ paddingLeft: "var(--space-12)" }}
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
									<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
									<circle cx="12" cy="7" r="4" />
								</svg>
							</div>
						</div>

						<div style={{ marginBottom: "var(--space-5)" }}>
							<label
								style={{
									display: "block",
									marginBottom: "var(--space-2)",
									fontSize: "var(--text-sm)",
									fontWeight: 600,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("initialSetup.email")}
							</label>
							<div suppressHydrationWarning style={{ position: "relative" }}>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder={t("initialSetup.emailPlaceholder")}
									required
									disabled={loading}
									autoComplete="email"
									suppressHydrationWarning
									style={{ paddingLeft: "var(--space-12)" }}
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

						<div style={{ marginBottom: "var(--space-5)" }}>
							<label
								style={{
									display: "block",
									marginBottom: "var(--space-2)",
									fontSize: "var(--text-sm)",
									fontWeight: 600,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("initialSetup.password")}
							</label>
							<div suppressHydrationWarning style={{ position: "relative" }}>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder={t("initialSetup.passwordPlaceholder")}
									required
									disabled={loading}
									autoComplete="new-password"
									data-1p-ignore
									data-lpignore="true"
									suppressHydrationWarning
									style={{ paddingLeft: "var(--space-12)" }}
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

						<div style={{ marginBottom: "var(--space-6)" }}>
							<label
								style={{
									display: "block",
									marginBottom: "var(--space-2)",
									fontSize: "var(--text-sm)",
									fontWeight: 600,
									color: "var(--color-text-secondary)",
								}}
							>
								{t("initialSetup.confirmPassword")}
							</label>
							<div suppressHydrationWarning style={{ position: "relative" }}>
								<input
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder={t("initialSetup.confirmPasswordPlaceholder")}
									required
									disabled={loading}
									autoComplete="new-password"
									data-1p-ignore
									data-lpignore="true"
									suppressHydrationWarning
									style={{ paddingLeft: "var(--space-12)" }}
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
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
									{t("initialSetup.registerInProgress")}
								</>
							) : (
								<>
									{t("initialSetup.registerButton")}
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

				<p
					style={{
						textAlign: "center",
						marginTop: "var(--space-6)",
						color: "var(--color-text-secondary)",
						fontSize: "var(--text-sm)",
					}}
				>
					{t("initialSetup.haveAccount")}{" "}
					<Link
						to="/login"
						style={{
							color: "var(--color-accent-primary)",
							fontWeight: 600,
							textDecoration: "none",
							transition: "color var(--transition-fast)",
						}}
					>
						{t("initialSetup.loginLink")}
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
						{t("initialSetup.footer")}
					</p>
				</div>
			</div>
		</div>
	);
};
