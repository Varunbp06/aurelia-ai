"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import type { FileItem } from "../services/api";
import AdminLayout from "../components/AdminLayout";
import KBSetupGuard from "../components/KBSetupGuard";
import { useIsMobile } from "../hooks/useMediaQuery";
import SourcesSummary from "../components/SourcesSummary";

interface TaskStatus {
	is_crawling: boolean;
	is_rebuilding: boolean;
	can_modify_index: boolean;
	active_tasks: string[];
}

export default function FileUploadManagement() {
	const { t } = useTranslation("common");
	const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
	const isMobile = useIsMobile();
	const [agentId, setAgentId] = useState<string | null>(null);
	const [files, setFiles] = useState<FileItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<string | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const [clearing, setClearing] = useState(false);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
	const [dragActive, setDragActive] = useState(false);
	const filesPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const isMountedRef = useRef(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		loadDefaultAgent();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [routeAgentId]);

	const loadDefaultAgent = async () => {
		try {
			if (!routeAgentId) return;
			const data = await api.getAgent(routeAgentId);
			setAgentId(data.id);
		} catch (error) {
			alert(
				`${t("errors.loadAgentFailed")}: ${error instanceof Error ? error.message : t("errors.unknown")}`,
			);
		}
	};

	const loadFiles = async () => {
		if (!agentId) return;
		setLoading(true);
		try {
			const data = await api.listFiles(agentId);
			setFiles(data.files);
		} catch (error) {
			alert(
				`${t("errors.loadFailed")}: ${error instanceof Error ? error.message : t("errors.unknown")}`,
			);
		} finally {
			setLoading(false);
		}
	};

	// Stable ref for polling callbacks.
	const loadFilesRef = useRef(loadFiles);
	loadFilesRef.current = loadFiles;

	// Initial load once the agent id resolves.
	useEffect(() => {
		isMountedRef.current = true;
		if (agentId) {
			void loadFilesRef.current();
		}
		return () => {
			isMountedRef.current = false;
		};
	}, [agentId]);

	// File status polling - auto-refresh when files are processing/pending
	useEffect(() => {
		const hasProcessingFiles = files.some(
			(f) => f.status === "processing" || f.status === "pending",
		);

		if (hasProcessingFiles && !filesPollingIntervalRef.current) {
			let pollCount = 0;
			const maxPolls = 100; // Safety limit to prevent infinite polling
			filesPollingIntervalRef.current = setInterval(async () => {
				pollCount++;
				if (pollCount > maxPolls) {
					if (filesPollingIntervalRef.current) {
						clearInterval(filesPollingIntervalRef.current);
						filesPollingIntervalRef.current = null;
					}
					return;
				}
				await loadFilesRef.current();
				setRefreshTrigger((prev) => prev + 1);
			}, 3000);
		} else if (!hasProcessingFiles && filesPollingIntervalRef.current) {
			clearInterval(filesPollingIntervalRef.current);
			filesPollingIntervalRef.current = null;
		}

		// Note: No cleanup here to avoid clearing interval on files change
		// The interval is managed by the conditions above
	}, [files]);

	// Cleanup files polling interval on unmount
	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (filesPollingIntervalRef.current) {
				clearInterval(filesPollingIntervalRef.current);
				filesPollingIntervalRef.current = null;
			}
		};
	}, []);

	const handleDrag = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") {
			setDragActive(true);
		} else if (e.type === "dragleave") {
			setDragActive(false);
		}
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			handleFiles(Array.from(e.dataTransfer.files));
		}
	};

	const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			handleFiles(Array.from(e.target.files));
		}
	};

	const handleFiles = async (selectedFiles: File[]) => {
		if (!agentId || selectedFiles.length === 0) return;

		setUploading(true);
		setUploadProgress(t("files.uploading", { count: selectedFiles.length }));
		try {
			const result = await api.uploadFiles(agentId, selectedFiles);
			if (result.failed > 0) {
				alert(
					t("files.uploadPartial", {
						uploaded: result.uploaded,
						failed: result.failed,
					}),
				);
			}
			await loadFiles();
			setRefreshTrigger((prev) => prev + 1);
		} catch (error) {
			alert(
				`${t("files.uploadFailed")}: ${error instanceof Error ? error.message : t("errors.unknown")}`,
			);
		} finally {
			setUploading(false);
			setUploadProgress(null);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleDelete = async (fileId: string) => {
		if (!agentId) return;
		if (!confirm(t("files.confirmDelete"))) return;

		setDeletingFileId(fileId);
		try {
			await api.deleteFile(agentId, fileId);
			await loadFiles();
			setRefreshTrigger((prev) => prev + 1);
		} catch (error) {
			alert(
				`${t("errors.deleteFailed")}: ${error instanceof Error ? error.message : t("errors.unknown")}`,
			);
		} finally {
			setDeletingFileId(null);
		}
	};

	const handleClearAll = () => {
		if (!agentId) return;
		if (files.length === 0) return;
		setShowClearConfirm(true);
	};

	const confirmClearAll = async () => {
		if (!agentId) return;

		setClearing(true);
		try {
			const result = await api.clearAllFiles(agentId);
			setShowClearConfirm(false);
			await loadFiles();
			setRefreshTrigger((prev) => prev + 1);
			alert(t("files.clearSuccess", { count: result.deleted_count }));
		} catch (error) {
			alert(
				`${t("files.clearFailed")}: ${error instanceof Error ? error.message : t("errors.unknown")}`,
			);
		} finally {
			setClearing(false);
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const getStatusBadge = (status: string) => {
		const styles: Record<string, { className: string; label: string }> = {
			ready: { className: "badge badge-success", label: t("files.ready") },
			processing: {
				className: "badge badge-warning badge-pulse",
				label: t("files.processing"),
			},
			uploading: {
				className: "badge badge-info",
				label: t("files.uploadingStatus"),
			},
			pending: { className: "badge badge-warning", label: t("files.pending") },
			failed: { className: "badge badge-error", label: t("status.failed") },
		};
		return styles[status] || { className: "badge", label: status };
	};

	const renderStatusPill = (file: FileItem) => (
		<span className={getStatusBadge(file.status).className}>
			<span className="badge-dot" />
			{getStatusBadge(file.status).label}
		</span>
	);

	const renderDeleteButton = (file: FileItem) => (
		<button
			onClick={() => handleDelete(file.id)}
			disabled={deletingFileId === file.id}
			className="btn-ghost"
			aria-label={t("buttons.delete")}
			style={{
				padding: "6px",
				borderRadius: "var(--radius-sm)",
				color:
					deletingFileId === file.id
						? "var(--color-error)"
						: "var(--color-text-muted)",
				display: "flex",
			}}
		>
			{deletingFileId === file.id ? (
				<div className="spinner" style={{ width: "14px", height: "14px" }} />
			) : (
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<polyline points="3 6 5 6 21 6" />
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
			)}
		</button>
	);

	const renderFileTypeIcon = () => (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<polyline points="14 2 14 8 20 8" />
		</svg>
	);

	return (
		<AdminLayout>
			{agentId ? (
				<KBSetupGuard agentId={agentId} mode="banner">
					{showClearConfirm && (
						<div
							style={{
								position: "fixed",
								inset: 0,
								background: "rgba(30, 27, 23, 0.5)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								padding: "var(--space-4)",
								zIndex: 1000,
							}}
						>
							<div
								className="glass-modal"
								style={{
									width: "100%",
									maxWidth: "420px",
									padding: "var(--space-6)",
								}}
							>
								<h3
									style={{
										margin: 0,
										marginBottom: "var(--space-3)",
										fontSize: "var(--text-lg)",
										color: "var(--color-text-primary)",
									}}
								>
									{t("files.clearAll")}
								</h3>
								<p
									style={{
										margin: 0,
										marginBottom: "var(--space-5)",
										color: "var(--color-text-secondary)",
										lineHeight: 1.6,
									}}
								>
									{t("files.confirmClearAll")}
								</p>
								<div
									style={{
										display: "flex",
										justifyContent: "flex-end",
										gap: "var(--space-3)",
									}}
								>
									<button type="button" className="btn-secondary" onClick={() => setShowClearConfirm(false)} disabled={clearing}>
										{t("buttons.cancel")}
									</button>
									<button type="button" className="btn-danger" onClick={confirmClearAll} disabled={clearing}>
										{clearing ? t("files.clearing") : t("buttons.confirm")}
									</button>
								</div>
							</div>
						</div>
					)}

					<div
						style={{
							padding: isMobile ? "var(--space-4)" : "var(--space-8)",
							maxWidth: "1200px",
							margin: "0 auto",
						}}
					>
						{/* Header */}
						<header style={{ marginBottom: "var(--space-6)" }}>
							<h1
								style={{
									fontSize: isMobile ? "var(--text-2xl)" : "28px",
									lineHeight: "36px",
									fontWeight: 600,
									letterSpacing: "-0.01em",
									color: "var(--color-text-primary)",
									marginBottom: "var(--space-1)",
								}}
							>
								{t("navigation.fileManagement")}
							</h1>
							<p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", margin: 0 }}>
								{t("files.description")}
							</p>
						</header>

						{/* Upload dropzone */}
						<section
							onDragEnter={handleDrag}
							onDragLeave={handleDrag}
							onDragOver={handleDrag}
							onDrop={handleDrop}
							onClick={() => fileInputRef.current?.click()}
							className="liquid-glass-card"
							style={{
								borderWidth: "2px",
								borderStyle: "dashed",
								borderColor: dragActive
									? "rgba(67, 67, 213, 0.5)"
									: "var(--color-border-hover)",
								padding: isMobile ? "var(--space-8) var(--space-4)" : "48px var(--space-6)",
								textAlign: "center",
								cursor: "pointer",
								background: dragActive
									? "rgba(67, 67, 213, 0.04)"
									: "var(--color-bg-secondary)",
								marginBottom: "var(--space-6)",
								transition:
									"border-color var(--transition-fast), background var(--transition-fast)",
							}}
						>
							<input
								ref={fileInputRef}
								type="file"
								multiple
								accept=".pdf,.txt,.md,.html,.docx,.xlsx,.csv"
								onChange={handleFileInput}
								style={{ display: "none" }}
							/>
							<div
								style={{
									width: "56px",
									height: "56px",
									borderRadius: "50%",
									background: dragActive
										? "rgba(67, 67, 213, 0.14)"
										: "rgba(67, 67, 213, 0.08)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									margin: "0 auto var(--space-4)",
									color: "var(--color-accent-primary)",
									transition: "background var(--transition-fast)",
								}}
							>
								<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
									<polyline points="17 8 12 3 7 8" />
									<line x1="12" y1="3" x2="12" y2="15" />
								</svg>
							</div>
							<h2 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
								{t("files.uploadTitle")}
							</h2>
							<p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "var(--space-4)" }}>
								{t("files.dropzoneText")}
							</p>
							<button
								type="button"
								className="btn-secondary"
								onClick={(e) => {
									e.stopPropagation();
									fileInputRef.current?.click();
								}}
								disabled={uploading}
							>
								{t("labels.browseFiles")}
							</button>
							<p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-3)" }}>
								{t("files.supportedFormats")}
							</p>
						</section>

						{uploadProgress && (
							<div
								style={{
									marginBottom: "var(--space-4)",
									padding: "var(--space-3) var(--space-4)",
									background: "rgba(67, 67, 213, 0.06)",
									borderRadius: "var(--radius-md)",
									display: "flex",
									alignItems: "center",
									gap: "var(--space-2)",
									color: "var(--color-accent-primary)",
									fontSize: "var(--text-sm)",
								}}
							>
								<div className="spinner" style={{ width: "14px", height: "14px" }} />
								{uploadProgress}
							</div>
						)}

						{/* Uploaded documents table */}
						<section className="table-card">
							<div className="table-card-header">
								<h2 style={{ fontSize: "var(--text-base)", fontWeight: 600, margin: 0 }}>
									{t("files.fileList")}
								</h2>
								<div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
									<span
										style={{
											fontSize: "var(--text-xs)",
											fontWeight: 500,
											color: "var(--color-text-secondary)",
											background: "var(--color-bg-tertiary)",
											border: "1px solid var(--color-border)",
											borderRadius: "var(--radius-md)",
											padding: "3px 10px",
										}}
									>
										{t("labels.filesCount", { count: String(files.length) })}
									</span>
									<button
										onClick={() => void loadFiles()}
										disabled={loading}
										className="btn-ghost"
										style={{ fontSize: "var(--text-xs)", padding: "var(--space-1) var(--space-3)" }}
									>
										{loading ? (
											<div className="spinner" style={{ width: "13px", height: "13px" }} />
										) : (
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<path d="M23 4v6h-6M1 20v-6h6" />
												<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
											</svg>
										)}
										{t("buttons.refresh")}
									</button>
									{files.length > 0 && (
										<button
											type="button"
											onClick={handleClearAll}
											disabled={clearing}
											className="btn-ghost"
											style={{ fontSize: "var(--text-xs)", padding: "var(--space-1) var(--space-3)", color: "var(--color-error)" }}
										>
											{clearing ? t("files.clearing") : t("files.clearAll")}
										</button>
									)}
								</div>
							</div>

							{loading && files.length === 0 ? (
								<div style={{ padding: "var(--space-4)" }}>
									<div className="skeleton skeleton-title" />
									{[0, 1, 2].map((i) => (
										<div key={i} className="skeleton skeleton-text" />
									))}
								</div>
							) : files.length === 0 ? (
								<div
									style={{
										textAlign: "center",
										padding: "var(--space-12) var(--space-6)",
										color: "var(--color-text-muted)",
									}}
								>
									<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto var(--space-3)", opacity: 0.4 }}>
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
										<polyline points="14 2 14 8 20 8" />
									</svg>
									<p style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--color-text-secondary)" }}>
										{t("files.noFiles")}
									</p>
									<p style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
										{t("files.uploadHint")}
									</p>
								</div>
							) : isMobile ? (
								<div>
									{files.map((file) => (
										<div key={file.id} style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
											<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
												<div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
													<span style={{ color: "var(--color-text-muted)", display: "flex", flexShrink: 0 }}>{renderFileTypeIcon()}</span>
													<span style={{ fontWeight: 500, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
														{file.filename}
													</span>
												</div>
												{renderDeleteButton(file)}
											</div>
											<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", fontSize: "11px", color: "var(--color-text-muted)" }}>
												<span>
													{formatFileSize(file.file_size)} · {new Date(file.created_at).toLocaleDateString()}
												</span>
												{renderStatusPill(file)}
											</div>
											{file.status === "failed" && (
												<p
													style={{
														marginTop: "var(--space-2)",
														fontSize: "11px",
														color: "var(--color-error)",
														background: "rgba(186,26,26,0.06)",
														borderLeft: "2px solid var(--color-error)",
														padding: "2px 8px",
														borderRadius: "4px",
													}}
												>
													{file.error_message?.trim() || t("files.processingFailedFallback")}
												</p>
											)}
										</div>
									))}
								</div>
							) : (
								<table className="au-table">
									<thead>
										<tr>
											<th>{t("users.name")}</th>
											<th style={{ width: "12%" }}>Size</th>
											<th style={{ width: "18%" }}>{t("users.status")}</th>
											<th style={{ width: "18%" }}>{t("labels.dateAdded")}</th>
											<th style={{ width: "10%", textAlign: "right" }}>{t("users.actions")}</th>
										</tr>
									</thead>
									<tbody>
										{files.map((file) => (
											<tr key={file.id}>
												<td>
													<div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
														<span style={{ color: "var(--color-outline-variant)", display: "flex", flexShrink: 0 }}>
															{renderFileTypeIcon()}
														</span>
														<span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
															{file.filename}
														</span>
													</div>
													{file.status === "failed" && (
														<span
															title={file.error_message?.trim() || t("files.processingFailedFallback")}
															style={{
																marginLeft: "28px",
																display: "block",
																maxWidth: "420px",
																overflow: "hidden",
																textOverflow: "ellipsis",
																whiteSpace: "nowrap",
																fontSize: "11px",
																color: "var(--color-error)",
															}}
														>
															{file.error_message?.trim() || t("files.processingFailedFallback")}
														</span>
													)}
												</td>
												<td style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
													{formatFileSize(file.file_size)}
												</td>
												<td>{renderStatusPill(file)}</td>
												<td style={{ color: "var(--color-text-secondary)" }}>
													{new Date(file.created_at).toLocaleDateString()}
												</td>
												<td style={{ textAlign: "right" }}>{renderDeleteButton(file)}</td>
											</tr>
										))}
									</tbody>
								</table>
							)}

							<div className="table-card-footer">
								<span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
									{t("labels.showingOf", { shown: String(files.length), total: String(files.length) })}
								</span>
								<span />
							</div>
						</section>

						{/* Sources summary below */}
						<div style={{ marginTop: "var(--space-6)" }}>
							<SourcesSummary agentId={agentId} refreshTrigger={refreshTrigger} />
						</div>
					</div>
				</KBSetupGuard>
			) : (
				<div
					style={{
						padding: isMobile ? "var(--space-4)" : "var(--space-8)",
						textAlign: "center",
					}}
				>
					<div className="spinner" />
				</div>
			)}
		</AdminLayout>
	);
}
