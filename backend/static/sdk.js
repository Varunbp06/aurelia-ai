// src/AureliaWidget.tsx
function formatAssistantMessage(content, sources = []) {
  if (!content) {
    return { content, references: [] };
  }
  const references = [];
  const seenUrls = /* @__PURE__ */ new Set();
  const sourceByUrl = /* @__PURE__ */ new Map();
  for (const source of sources) {
    if (source.type !== "url" || typeof source.url !== "string" || !/^https?:\/\//.test(source.url) || sourceByUrl.has(source.url)) {
      continue;
    }
    sourceByUrl.set(source.url, source);
  }
  const addReference = (url) => {
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    const source = sourceByUrl.get(url);
    references.push({
      title: source?.title?.trim() || url,
      url
    });
  };
  const formattedContent = content.replace(
    /\[([^\]]+)\]\((#source-(\d+)|https?:\/\/[^\s)]+)\)/g,
    (_match, label, target, sourceIndexText) => {
      if (sourceIndexText) {
        const sourceIndex = Number(sourceIndexText) - 1;
        const source = sources[sourceIndex];
        if (source && source.type === "url" && source.url && /^https?:\/\//.test(source.url)) {
          addReference(source.url);
        }
        return label;
      }
      if (sourceByUrl.has(target)) {
        addReference(target);
        return label;
      }
      return _match;
    }
  );
  return {
    content: formattedContent,
    references
  };
}
var AUTO_INIT_SCRIPT_PARAM_MAP = {
  agentId: ["agentId", "agent_id"],
  apiBase: ["apiBase", "api_base"],
  themeColor: ["themeColor", "theme_color"],
  welcomeMessage: ["welcomeMessage", "welcome_message"],
  language: ["language", "locale"],
  position: ["position"],
  theme: ["theme"]
};
function buildDefaultLogoUrl(apiBase) {
  if (!apiBase) {
    return "/aurelia-logo.png";
  }
  try {
    return new URL("/aurelia-logo.png", `${apiBase}/`).toString();
  } catch {
    return "/aurelia-logo.png";
  }
}
var StorageAdapter = class {
  constructor() {
    this.memoryStore = /* @__PURE__ */ new Map();
    this.storageAvailable = null;
  }
  isAvailable() {
    if (this.storageAvailable !== null) {
      return this.storageAvailable;
    }
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, "test");
      window.localStorage.removeItem(testKey);
      this.storageAvailable = true;
      return true;
    } catch {
      this.storageAvailable = false;
      return false;
    }
  }
  getItem(key) {
    if (this.isAvailable()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
      }
    }
    return this.memoryStore.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.isAvailable()) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
      }
    }
    this.memoryStore.set(key, value);
  }
  removeItem(key) {
    if (this.isAvailable()) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
      }
    }
    this.memoryStore.delete(key);
  }
};
var AureliaWidget = class {
  constructor(config) {
    this.container = null;
    this.button = null;
    this.unreadBadge = null;
    this.chatWindow = null;
    this.messages = [];
    this.sessionId = null;
    this.isOpen = false;
    this.VISITOR_STORAGE_KEY = "aurelia_visitor_id";
    this.effectiveTheme = "light";
    this.originalTitle = "";
    this.titleBlinkInterval = null;
    this.hasUnread = false;
    this.pollIntervalId = null;
    this.lastMessageId = 0;
    this.isSending = false;
    this.streamAbortController = null;
    this.streamingMessage = null;
    this.streamingMessageContent = null;
    this.thinkingIndicator = null;
    this.thinkingIndicatorText = null;
    this.thinkingElapsed = 0;
    this.thinkingTimerId = null;
    this.currentStreamContent = "";
    this.currentStreamSources = [];
    // Track imperative event listeners for cleanup
    this._buttonClickListener = null;
    this._closeBtnClickListener = null;
    this._sendBtnClickListener = null;
    this._inputKeypressListener = null;
    const apiBase = this.detectApiBase(config.apiBase);
    this.hasTitleOverride = typeof config.title === "string" && config.title.trim().length > 0;
    this.hasWelcomeMessageOverride = typeof config.welcomeMessage === "string" && config.welcomeMessage.trim().length > 0;
    this.config = {
      agentId: config.agentId,
      apiBase,
      themeColor: config.themeColor || "",
      logoUrl: config.logoUrl || buildDefaultLogoUrl(apiBase),
      title: config.title || "AI\u52A9\u624B",
      welcomeMessage: config.welcomeMessage || "\u4F60\u597D\uFF01\u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u52A9\u60A8\u7684\u5417\uFF1F",
      language: config.language || "auto",
      position: config.position || "right",
      theme: config.theme || "auto"
    };
    this.STORAGE_KEY = `aurelia_session_${this.config.agentId}`;
    this.storage = new StorageAdapter();
    this.sessionId = this.storage.getItem(this.STORAGE_KEY);
    this.visitorId = this.storage.getItem(this.VISITOR_STORAGE_KEY) || this.generateVisitorId();
    this.effectiveTheme = this.getEffectiveTheme();
  }
  generateVisitorId() {
    const visitorId = `visitor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
    this.storage.setItem(this.VISITOR_STORAGE_KEY, visitorId);
    return visitorId;
  }
  detectApiBase(configuredApiBase) {
    if (configuredApiBase) {
      try {
        const url = new URL(configuredApiBase, window.location.href);
        if ((url.protocol === "http:" || url.protocol === "https:") && url.port === "3000") {
          const directBase = `${url.protocol}//${url.hostname}:8000`;
          console.info("[Aurelia Widget] Rewriting configured dev apiBase to direct backend:", directBase);
          return directBase;
        }
        return url.toString().replace(/\/$/, "");
      } catch {
        return configuredApiBase;
      }
    }
    const currentScript = document.currentScript;
    if (currentScript instanceof HTMLScriptElement && currentScript.src) {
      try {
        const scriptUrl = new URL(currentScript.src, window.location.href);
        console.info("[Aurelia Widget] Detected API base from current script:", scriptUrl.origin);
        return scriptUrl.origin;
      } catch {
      }
    }
    const scripts = document.querySelectorAll("script[src]");
    for (const script of scripts) {
      const src = script.getAttribute("src") || "";
      if (!src.includes("sdk.js") && !src.includes("aurelia")) {
        continue;
      }
      try {
        const scriptUrl = new URL(src, window.location.href);
        console.info("[Aurelia Widget] Detected API base from script src:", scriptUrl.origin);
        return scriptUrl.origin;
      } catch {
      }
    }
    const port = window.location.port;
    if (port === "3000" || port === "5173") {
      const devBase = `${window.location.protocol}//${window.location.hostname}:8000`;
      console.info("[Aurelia Widget] Development mode detected, using:", devBase);
      return devBase;
    }
    if (window.location.protocol === "file:") {
      console.error("[Aurelia Widget] Cannot determine API base from a local file. Please set apiBase explicitly.");
      return "";
    }
    console.warn("[Aurelia Widget] Falling back to window.location.origin. Set apiBase explicitly if the API is hosted elsewhere.");
    return window.location.origin;
  }
  getEffectiveTheme() {
    if (this.config.theme === "light" || this.config.theme === "dark") {
      return this.config.theme;
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }
  async loadPublicConfig() {
    if (!this.config.apiBase) {
      console.warn("[Aurelia Widget] Skipping public config fetch because apiBase could not be determined.");
      return;
    }
    try {
      const publicConfigUrl = new URL(`${this.config.apiBase}/api/v1/config:public`);
      if (this.config.agentId) {
        publicConfigUrl.searchParams.set("agent_id", this.config.agentId);
      }
      const response = await fetch(publicConfigUrl.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (!this.config.agentId && data.default_agent_id) {
        this.config.agentId = data.default_agent_id;
      }
      this.config.themeColor = this.config.themeColor || data.widget_color || "#3B82F6";
      if (!this.hasTitleOverride) {
        this.config.title = data.widget_title || "AI\u52A9\u624B";
      }
      if (!this.hasWelcomeMessageOverride) {
        this.config.welcomeMessage = data.welcome_message || "\u4F60\u597D\uFF01\u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u52A9\u60A8\u7684\u5417\uFF1F";
      }
      this.effectiveTheme = this.getEffectiveTheme();
    } catch (error) {
      console.warn("[Aurelia Widget] Failed to load public config, using defaults.", error);
      if (error instanceof TypeError) {
        console.warn("[Aurelia Widget] Public config request may be blocked by CORS, network issues, or an incorrect apiBase:", this.config.apiBase);
      }
    }
  }
  /**
   * 初始化Widget
   */
  async init() {
    if (!document.body) {
      console.warn("[Aurelia Widget] document.body is not available yet. Call init() after DOMContentLoaded or place the embed code near the end of <body>.");
      return;
    }
    if (document.getElementById("aurelia-widget-container")) {
      console.warn("[Aurelia Widget] Initialization skipped because #aurelia-widget-container already exists. Avoid loading or initializing the widget twice on the same page.");
      return;
    }
    await this.loadPublicConfig();
    this.originalTitle = document.title;
    this.createStyles();
    this.createContainer();
    this.createButton();
    this.createChatWindow();
    this.showGreetingBubble();
    this.startTitleBlink();
    if (this.sessionId) {
      void this.loadHistory();
      return;
    }
    if (this.config.welcomeMessage) {
      this.addMessage({
        role: "assistant",
        content: this.config.welcomeMessage,
        timestamp: /* @__PURE__ */ new Date()
      });
    }
  }
  /**
   * 显示打招呼气泡
   */
  showGreetingBubble() {
    if (!this.button)
      return;
    const bubble = document.createElement("div");
    bubble.className = "aurelia-greeting-bubble";
    bubble.textContent = this.getText("greetingBubble");
    const position = this.config.position;
    bubble.style.position = "fixed";
    bubble.style.bottom = "100px";
    bubble.style[position] = "24px";
    bubble.style.zIndex = "9999";
    document.body.appendChild(bubble);
    setTimeout(() => {
      bubble.remove();
    }, 5e3);
  }
  async loadHistory() {
    if (!this.sessionId)
      return;
    try {
      const response = await fetch(
        `${this.config.apiBase}/api/v1/chat/messages?session_id=${encodeURIComponent(this.sessionId)}`
      );
      if (!response.ok) {
        throw new Error("Failed to load history");
      }
      const messages = await response.json();
      if (messages && messages.length > 0) {
        for (const message of messages) {
          this.addMessage({
            role: message.role === "user" ? "user" : "assistant",
            content: message.content,
            sources: message.sources,
            timestamp: /* @__PURE__ */ new Date()
          });
          if (message.id > this.lastMessageId) {
            this.lastMessageId = message.id;
          }
        }
        this.startPolling();
        return;
      }
    } catch {
    }
    this.sessionId = null;
    this.storage.removeItem(this.STORAGE_KEY);
    if (this.config.welcomeMessage) {
      this.addMessage({
        role: "assistant",
        content: this.config.welcomeMessage,
        timestamp: /* @__PURE__ */ new Date()
      });
    }
  }
  /**
   * 开始标题闪烁提醒
   */
  startTitleBlink() {
    if (this.titleBlinkInterval)
      return;
    this.hasUnread = true;
    this.updateUnreadBadge();
    let showOriginal = true;
    this.titleBlinkInterval = window.setInterval(() => {
      document.title = showOriginal ? this.originalTitle : "\u2757 " + this.getText("newMessage");
      showOriginal = !showOriginal;
    }, 1e3);
  }
  /**
   * 停止标题闪烁
   */
  stopTitleBlink() {
    if (this.titleBlinkInterval) {
      clearInterval(this.titleBlinkInterval);
      this.titleBlinkInterval = null;
    }
    document.title = this.originalTitle;
    this.hasUnread = false;
    this.updateUnreadBadge();
  }
  /**
   * 创建样式
   */
  createStyles() {
    const style = document.createElement("style");
    style.id = "aurelia-widget-styles";
    const isDark = this.effectiveTheme === "dark";
    const bgColor = isDark ? "#1a1a2e" : "white";
    const textColor = isDark ? "#e2e8f0" : "#1f2937";
    const mutedColor = isDark ? "#94a3b8" : "#6b7280";
    const borderColor = isDark ? "rgba(148, 163, 184, 0.2)" : "#e5e7eb";
    const inputBg = isDark ? "#0f0f1a" : "white";
    const messageBg = isDark ? "#2d2d44" : "#f3f4f6";
    const errorBg = isDark ? "rgba(239, 68, 68, 0.2)" : "#fef2f2";
    style.textContent = `
      #aurelia-widget-container, #aurelia-widget-container * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      #aurelia-widget-button {
        position: fixed;
        bottom: 24px;
        ${this.config.position === "left" ? "left" : "right"}: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${this.config.themeColor};
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        z-index: 9999;
      }

      #aurelia-widget-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }

      #aurelia-widget-button svg {
        width: 30px;
        height: 30px;
        fill: white;
      }

      .aurelia-unread-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
      }

      .aurelia-greeting-bubble {
        background: white;
        color: ${textColor};
        padding: 10px 14px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-size: 13px;
        line-height: 1.4;
        animation: aurelia-bubble-fadein 0.3s ease-out;
        max-width: 200px;
      }

      .aurelia-greeting-bubble::after {
        content: '';
        position: absolute;
        bottom: -6px;
        ${this.config.position === "left" ? "left" : "right"}: 30px;
        width: 12px;
        height: 12px;
        background: white;
        transform: rotate(45deg);
        border-bottom: 1px solid ${borderColor};
        border-right: 1px solid ${borderColor};
      }

      @keyframes aurelia-bubble-fadein {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      #aurelia-chat-window {
        position: fixed;
        bottom: 96px;
        ${this.config.position === "left" ? "left" : "right"}: 24px;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 120px);
        background: ${bgColor};
        border-radius: 20px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0);
        transform-origin: ${this.config.position === "left" ? "bottom left" : "bottom right"};
        transition: transform 0.3s ease;
        z-index: 9998;
      }

      #aurelia-chat-window.open {
        transform: scale(1);
      }

      #aurelia-chat-window.closing {
        transform: scale(0);
      }

      .aurelia-header {
        background: linear-gradient(135deg, ${this.config.themeColor} 0%, ${this.adjustColor(this.config.themeColor, -20)} 100%);
        color: white;
        padding: 20px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .aurelia-header-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 18px;
        font-weight: 600;
      }

      .aurelia-header-logo {
        width: 32px;
        height: 32px;
        object-fit: contain;
        border-radius: 8px;
        background: rgba(255,255,255,0.2);
        padding: 4px;
        flex-shrink: 0;
      }

      .aurelia-close {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.15);
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        color: white;
      }

      .aurelia-close:hover {
        background: rgba(255,255,255,0.25);
      }

      .aurelia-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: ${inputBg};
      }

      #aurelia-widget-container .aurelia-message {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        max-width: 85%;
        min-width: 0;
        width: fit-content;
        animation: aurelia-message-fadein 0.3s ease-out;
      }

      #aurelia-widget-container .aurelia-message-user {
        align-self: flex-end;
        align-items: flex-end;
      }

      #aurelia-widget-container .aurelia-message-assistant {
        align-self: flex-start;
        align-items: flex-start;
      }

      #aurelia-widget-container .aurelia-message-content {
        display: block;
        align-self: flex-start;
        width: fit-content;
        max-width: 100%;
        min-width: 0;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
      }

      #aurelia-widget-container .aurelia-message-user .aurelia-message-content {
        align-self: flex-end;
      }

      #aurelia-widget-container .aurelia-message-content > * {
        display: block;
        max-width: 100%;
      }

      #aurelia-widget-container .aurelia-message-content p,
      #aurelia-widget-container .aurelia-message-content ul,
      #aurelia-widget-container .aurelia-message-content ol,
      #aurelia-widget-container .aurelia-message-content pre,
      #aurelia-widget-container .aurelia-message-content blockquote {
        margin: 0 0 10px;
      }

      #aurelia-widget-container .aurelia-message-content p:last-child,
      #aurelia-widget-container .aurelia-message-content ul:last-child,
      #aurelia-widget-container .aurelia-message-content ol:last-child,
      #aurelia-widget-container .aurelia-message-content pre:last-child,
      #aurelia-widget-container .aurelia-message-content blockquote:last-child {
        margin-bottom: 0;
      }

      #aurelia-widget-container .aurelia-message-content ul,
      #aurelia-widget-container .aurelia-message-content ol {
        padding-left: 18px;
      }

      #aurelia-widget-container .aurelia-message-content code {
        font-family: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace;
        font-size: 12px;
        background: rgba(15, 23, 42, 0.08);
        padding: 1px 4px;
        border-radius: 4px;
      }

      #aurelia-widget-container .aurelia-message-content pre {
        background: #0f172a;
        color: #e2e8f0;
        padding: 10px 12px;
        border-radius: 10px;
        overflow-x: auto;
      }

      #aurelia-widget-container .aurelia-message-content pre code {
        background: transparent;
        padding: 0;
        color: inherit;
      }

      #aurelia-widget-container .aurelia-message-content a {
        color: ${this.adjustColor(this.config.themeColor, -10)};
        text-decoration: underline;
      }

      #aurelia-widget-container .aurelia-message-content blockquote {
        padding-left: 12px;
        border-left: 3px solid rgba(148, 163, 184, 0.4);
        color: ${mutedColor};
      }

      #aurelia-widget-container .aurelia-message-user .aurelia-message-content {
        background: ${this.config.themeColor};
        color: white;
        border-bottom-right-radius: 4px;
      }

      #aurelia-widget-container .aurelia-message-user .aurelia-message-content a {
        color: white;
      }

      #aurelia-widget-container .aurelia-message-user .aurelia-message-content code {
        background: rgba(255, 255, 255, 0.18);
        color: white;
      }

      #aurelia-widget-container .aurelia-message-assistant .aurelia-message-content {
        background: ${messageBg};
        color: ${textColor};
        border-bottom-left-radius: 4px;
      }

      #aurelia-widget-container .aurelia-message-error .aurelia-message-content {
        background: ${errorBg};
        color: ${isDark ? "#fca5a5" : "#dc2626"};
        border: 1px solid ${isDark ? "rgba(239,68,68,0.35)" : "#fecaca"};
      }

      .aurelia-stream-cursor {
        display: inline-block;
        width: 0.5rem;
        height: 1em;
        margin-left: 0.12rem;
        vertical-align: text-bottom;
        background: ${this.config.themeColor};
        animation: aurelia-cursor-blink 1s steps(1) infinite;
      }

      @keyframes aurelia-cursor-blink {
        0%, 50% { opacity: 1; }
        50.01%, 100% { opacity: 0; }
      }

      .aurelia-loading {
        display: flex;
        gap: 4px;
        padding: 12px 16px !important;
        align-self: flex-start;
        margin-top: 4px !important;
      }

      .aurelia-loading-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${mutedColor};
        animation: aurelia-bounce 1.4s infinite ease-in-out both;
      }

      .aurelia-loading-dot:nth-child(1) { animation-delay: -0.32s; }
      .aurelia-loading-dot:nth-child(2) { animation-delay: -0.16s; }

      @keyframes aurelia-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      .aurelia-input-area {
        padding: 16px 20px 24px 20px !important;
        border-top: 1px solid ${borderColor};
        display: flex;
        gap: 12px;
        background: ${bgColor};
        flex-shrink: 0;
      }

      .aurelia-input {
        flex: 1;
        height: 48px;
        padding: 0 20px 0 20px !important;
        border: 1px solid ${borderColor};
        border-radius: 24px;
        font-size: 14px;
        outline: none;
        transition: all 0.2s;
        background: ${inputBg};
        color: ${textColor};
        margin-bottom: 8px !important;
        margin-left: 4px !important;
      }

      .aurelia-input::placeholder {
        color: ${mutedColor};
      }

      .aurelia-input:focus {
        border-color: ${this.config.themeColor};
        box-shadow: 0 0 0 3px ${this.hexToRgba(this.config.themeColor, 0.1)};
      }

      .aurelia-send {
        width: 48px;
        height: 48px;
        border: none;
        border-radius: 50%;
        background: ${this.config.themeColor};
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
      }

      .aurelia-send:hover:not(:disabled) {
        transform: scale(1.05);
        box-shadow: 0 4px 12px ${this.hexToRgba(this.config.themeColor, 0.3)};
      }

      .aurelia-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .aurelia-send svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
      }

      .aurelia-error {
        padding: 12px 16px;
        background: ${errorBg};
        color: ${isDark ? "#fca5a5" : "#dc2626"};
        font-size: 13px;
        text-align: center;
        border-top: 1px solid ${isDark ? "rgba(239,68,68,0.35)" : "#fecaca"};
      }

      #aurelia-widget-container .aurelia-message-time {
        font-size: 11px;
        color: ${mutedColor};
        margin-top: 4px;
        padding: 0 4px;
      }

      #aurelia-widget-container .aurelia-message-user .aurelia-message-time {
        text-align: right;
      }

      .aurelia-thinking {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: ${mutedColor};
        font-size: 12px;
        margin-top: 8px;
      }

      .aurelia-thinking-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid ${this.hexToRgba(this.config.themeColor, 0.2)};
        border-top-color: ${this.config.themeColor};
        border-radius: 50%;
        animation: aurelia-spin 0.8s linear infinite;
      }

      @keyframes aurelia-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes aurelia-message-fadein {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 480px) {
        #aurelia-chat-window {
          width: calc(100vw - 32px);
          height: calc(100vh - 120px);
          max-height: 640px;
          bottom: 88px;
          left: 16px !important;
          right: 16px !important;
        }

        #aurelia-widget-button {
          bottom: 16px;
          ${this.config.position === "left" ? "left" : "right"}: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }
  adjustColor(hex, amount) {
    let useHash = false;
    let color = hex;
    if (color[0] === "#") {
      color = color.slice(1);
      useHash = true;
    }
    const num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    let g = (num >> 8 & 255) + amount;
    let b = (num & 255) + amount;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `${useHash ? "#" : ""}${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
  }
  hexToRgba(hex, alpha) {
    let color = hex.replace("#", "");
    if (color.length === 3) {
      const [r2, g2, b2] = color.split("");
      color = `${r2}${r2}${g2}${g2}${b2}${b2}`;
    }
    const num = parseInt(color, 16);
    const r = num >> 16 & 255;
    const g = num >> 8 & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  updateUnreadBadge() {
    if (!this.button) {
      return;
    }
    if (this.hasUnread) {
      if (!this.unreadBadge) {
        const badge = document.createElement("span");
        badge.className = "aurelia-unread-badge";
        badge.textContent = "1";
        this.button.appendChild(badge);
        this.unreadBadge = badge;
      }
      return;
    }
    this.unreadBadge?.remove();
    this.unreadBadge = null;
  }
  /**
   * 创建容器
   */
  createContainer() {
    this.container = document.createElement("div");
    this.container.id = "aurelia-widget-container";
    document.body.appendChild(this.container);
  }
  /**
   * 创建浮动按钮
   */
  createButton() {
    this.button = document.createElement("div");
    this.button.id = "aurelia-widget-button";
    this.button.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
    `;
    this._buttonClickListener = () => this.toggle();
    this.button.addEventListener("click", this._buttonClickListener);
    this.container.appendChild(this.button);
    this.updateUnreadBadge();
  }
  /**
   * 创建聊天窗口
   */
  createChatWindow() {
    this.chatWindow = document.createElement("div");
    this.chatWindow.id = "aurelia-chat-window";
    const safeLogoUrl = this.config.logoUrl ? this.sanitizeUrlAttribute(this.config.logoUrl) : "";
    const safeTitle = this.escapeHtml(this.config.title);
    const safePlaceholder = this.escapeHtml(this.getText("inputPlaceholder"));
    this.chatWindow.innerHTML = `
      <div class="aurelia-header">
        <div class="aurelia-header-title">
          ${safeLogoUrl ? `<img src="${safeLogoUrl}" class="aurelia-header-logo" alt="">` : ""}
          <span>${safeTitle}</span>
        </div>
        <button class="aurelia-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="aurelia-messages"></div>
      <div class="aurelia-input-area">
        <input type="text" class="aurelia-input" placeholder="${safePlaceholder}" maxlength="2000">
        <button class="aurelia-send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
    const closeBtn = this.chatWindow.querySelector(".aurelia-close");
    this._closeBtnClickListener = () => this.close();
    closeBtn.addEventListener("click", this._closeBtnClickListener);
    const input = this.chatWindow.querySelector(".aurelia-input");
    const sendBtn = this.chatWindow.querySelector(".aurelia-send");
    this._sendBtnClickListener = () => {
      if (this.isSending) {
        return;
      }
      const message = input.value.trim();
      if (message) {
        if (message.length > 2e3) {
          this.showError(this.getText("messageTooLong"));
          return;
        }
        this.sendMessage(message);
        input.value = "";
      }
    };
    sendBtn.addEventListener("click", this._sendBtnClickListener);
    this._inputKeypressListener = (e) => {
      if (e.key === "Enter")
        this._sendBtnClickListener?.();
    };
    input.addEventListener("keypress", this._inputKeypressListener);
    this.container.appendChild(this.chatWindow);
  }
  /**
   * 切换聊天窗口
   */
  toggle() {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.open();
  }
  open() {
    this.isOpen = true;
    this.chatWindow?.classList.remove("closing");
    this.chatWindow?.classList.add("open");
    this.stopTitleBlink();
    this.updateUnreadBadge();
    const input = this.chatWindow?.querySelector(".aurelia-input");
    setTimeout(() => {
      input?.focus();
    }, 300);
  }
  close() {
    this.isOpen = false;
    this.chatWindow?.classList.remove("open");
    this.chatWindow?.classList.add("closing");
  }
  getRequestLocale() {
    if (this.config.language && this.config.language !== "auto") {
      return this.config.language;
    }
    return navigator.language || "en-US";
  }
  /**
   * Get localized text based on language setting
   */
  getText(key) {
    const texts = {
      sendFailed: { "en-US": "Send failed, please try again later", "zh-CN": "\u53D1\u9001\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" },
      networkError: { "en-US": "Network connection failed, please check your connection", "zh-CN": "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC" },
      quotaExceeded: { "en-US": "Daily message limit reached", "zh-CN": "\u4ECA\u65E5\u6D88\u606F\u5DF2\u8FBE\u4E0A\u9650" },
      takenOverNotice: { "en-US": "Your conversation has been transferred to a human agent. Please wait for their reply.", "zh-CN": "\u5DF2\u8F6C\u63A5\u4EBA\u5DE5\u5BA2\u670D\uFF0C\u8BF7\u7B49\u5F85\u56DE\u590D\u3002" },
      inputPlaceholder: { "en-US": "Type your question...", "zh-CN": "\u8F93\u5165\u60A8\u7684\u95EE\u9898..." },
      messageTooLong: { "en-US": "Message too long (max 2000 characters)", "zh-CN": "\u6D88\u606F\u8FC7\u957F\uFF08\u6700\u591A2000\u5B57\u7B26\uFF09" },
      greetingBubble: { "en-US": "Hi! How can I help you?", "zh-CN": "\u4F60\u597D\uFF01\u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u60A8\uFF1F" },
      newMessage: { "en-US": "New message", "zh-CN": "\u65B0\u6D88\u606F" },
      thinking: { "en-US": "Thinking...", "zh-CN": "\u601D\u8003\u4E2D..." },
      references: { "en-US": "References", "zh-CN": "\u53C2\u8003\u6765\u6E90" }
    };
    const locale = this.getRequestLocale().toLowerCase();
    return locale.startsWith("zh") ? texts[key]["zh-CN"] || texts[key]["en-US"] || key : texts[key]["en-US"] || texts[key]["zh-CN"] || key;
  }
  /**
   * 将纯文本安全转义为HTML
   */
  escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /**
   * Sanitise a URL to be safe for use in an HTML attribute (e.g. src/href).
   * Only allows http/https URLs and strips anything else.
   */
  sanitizeUrlAttribute(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return this.escapeHtml(url);
      }
    } catch {
    }
    return "";
  }
  /**
   * 安全渲染基础 Markdown
   */
  renderMarkdown(markdown) {
    if (!markdown) {
      return "";
    }
    const blocks = markdown.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const renderInline = (text) => {
      let html = this.escapeHtml(text);
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
      html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
      html = html.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
        const safeLabel = label;
        const safeUrl = this.sanitizeUrlAttribute(url);
        if (!safeUrl) {
          return safeLabel;
        }
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
      });
      return html;
    };
    const renderedBlocks = blocks.map((block) => {
      if (/^```/.test(block) && /```$/.test(block)) {
        const code = block.replace(/^```\w*\n?/, "").replace(/```$/, "");
        return `<pre><code>${this.escapeHtml(code)}</code></pre>`;
      }
      if (/^(?:[-*]\s.+\n?)+$/.test(block)) {
        const items = block.split("\n").map((line) => line.replace(/^[-*]\s+/, "").trim()).filter(Boolean).map((line) => `<li>${renderInline(line)}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      if (/^(?:\d+\.\s.+\n?)+$/.test(block)) {
        const items = block.split("\n").map((line) => line.replace(/^\d+\.\s+/, "").trim()).filter(Boolean).map((line) => `<li>${renderInline(line)}</li>`).join("");
        return `<ol>${items}</ol>`;
      }
      if (/^>\s?/.test(block)) {
        const quote = block.split("\n").map((line) => line.replace(/^>\s?/, "")).join("<br>");
        return `<blockquote>${renderInline(quote)}</blockquote>`;
      }
      if (/^#{1,6}\s/.test(block)) {
        const headingText = block.replace(/^#{1,6}\s+/, "");
        return `<p><strong>${renderInline(headingText)}</strong></p>`;
      }
      return `<p>${renderInline(block).replace(/\n/g, "<br>")}</p>`;
    });
    return renderedBlocks.join("");
  }
  updateMessageContent(element, content, includeCursor = false) {
    element.innerHTML = this.renderMarkdown(content) + (includeCursor ? '<span class="aurelia-stream-cursor"></span>' : "");
  }
  createMessageElement(message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `aurelia-message aurelia-message-${message.role}`;
    const contentDiv = document.createElement("div");
    contentDiv.className = "aurelia-message-content";
    if (message.role === "assistant") {
      const formattedMessage = formatAssistantMessage(message.content, message.sources);
      const referenceMarkdown = formattedMessage.references.length > 0 ? `

**${this.getText("references")}**
${formattedMessage.references.map((reference) => `- [${reference.title}](${reference.url})`).join("\n")}` : "";
      this.updateMessageContent(contentDiv, formattedMessage.content + referenceMarkdown);
    } else {
      this.updateMessageContent(contentDiv, message.content);
    }
    messageDiv.appendChild(contentDiv);
    const timeDiv = document.createElement("div");
    timeDiv.className = "aurelia-message-time";
    timeDiv.textContent = message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    messageDiv.appendChild(timeDiv);
    return messageDiv;
  }
  formatThinkingText() {
    return `${this.getText("thinking")} ${this.thinkingElapsed}s`;
  }
  showThinkingIndicator(elapsed = 0) {
    this.hideLoading();
    if (!this.currentStreamContent.trim()) {
      this.streamingMessage?.remove();
      this.streamingMessage = null;
      this.streamingMessageContent = null;
    }
    this.thinkingElapsed = elapsed;
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    if (!messagesContainer) {
      return;
    }
    if (!this.thinkingIndicator) {
      const indicator = document.createElement("div");
      indicator.className = "aurelia-thinking";
      indicator.innerHTML = `
        <span class="aurelia-thinking-spinner"></span>
        <span>${this.getText("thinking")}</span>
      `;
      messagesContainer.appendChild(indicator);
      this.thinkingIndicator = indicator;
      this.thinkingIndicatorText = indicator.querySelector("span:last-child");
    }
    if (this.thinkingIndicatorText) {
      this.thinkingIndicatorText.textContent = this.formatThinkingText();
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (this.thinkingTimerId === null) {
      this.thinkingTimerId = window.setInterval(() => {
        this.thinkingElapsed += 1;
        if (this.thinkingIndicatorText) {
          this.thinkingIndicatorText.textContent = this.formatThinkingText();
        }
      }, 1e3);
    }
  }
  hideThinkingIndicator() {
    if (this.thinkingTimerId !== null) {
      window.clearInterval(this.thinkingTimerId);
      this.thinkingTimerId = null;
    }
    this.thinkingIndicator?.remove();
    this.thinkingIndicator = null;
    this.thinkingIndicatorText = null;
    this.thinkingElapsed = 0;
  }
  removeStreamingMessage() {
    this.streamingMessage?.remove();
    this.streamingMessage = null;
    this.streamingMessageContent = null;
    this.currentStreamContent = "";
    this.currentStreamSources = [];
  }
  createStreamingMessage(includeCursor = false) {
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    const messageDiv = document.createElement("div");
    messageDiv.className = "aurelia-message aurelia-message-assistant";
    const contentDiv = document.createElement("div");
    contentDiv.className = "aurelia-message-content";
    this.updateMessageContent(contentDiv, this.currentStreamContent, includeCursor);
    messageDiv.appendChild(contentDiv);
    if (!messagesContainer) {
      this.streamingMessage = messageDiv;
      this.streamingMessageContent = contentDiv;
      this.currentStreamContent = "";
      return messageDiv;
    }
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    this.streamingMessage = messageDiv;
    this.streamingMessageContent = contentDiv;
    this.currentStreamContent = "";
    return messageDiv;
  }
  appendToStreamingMessage(chunk) {
    if (!this.streamingMessage || !this.streamingMessageContent) {
      this.hideThinkingIndicator();
      this.createStreamingMessage();
    }
    this.currentStreamContent += chunk;
    if (this.streamingMessageContent) {
      this.updateMessageContent(this.streamingMessageContent, this.currentStreamContent, true);
    }
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    if (!messagesContainer) {
      return;
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  finalizeStreamingMessage(sources = []) {
    if (!this.streamingMessage || !this.streamingMessageContent) {
      return;
    }
    if (!this.currentStreamContent.trim()) {
      this.removeStreamingMessage();
      return;
    }
    const cursor = this.streamingMessage.querySelector(".aurelia-stream-cursor");
    cursor?.remove();
    this.currentStreamSources = sources;
    const formattedMessage = formatAssistantMessage(this.currentStreamContent, sources);
    const referenceMarkdown = formattedMessage.references.length > 0 ? `

**${this.getText("references")}**
${formattedMessage.references.map((reference) => `- [${reference.title}](${reference.url})`).join("\n")}` : "";
    const finalContent = formattedMessage.content + referenceMarkdown;
    this.updateMessageContent(this.streamingMessageContent, finalContent);
    this.messages.push({
      role: "assistant",
      content: finalContent,
      sources,
      timestamp: /* @__PURE__ */ new Date()
    });
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    this.streamingMessage = null;
    this.streamingMessageContent = null;
    this.currentStreamContent = "";
    this.currentStreamSources = [];
  }
  /**
   * 添加消息到界面
   */
  addMessage(message) {
    this.messages.push(message);
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    if (!message.content) {
      console.error("Message content is null or undefined:", message);
      return;
    }
    if (!messagesContainer) {
      return;
    }
    const messageDiv = this.createMessageElement(message);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (message.role === "assistant" && !this.isOpen) {
      this.hasUnread = true;
      this.updateUnreadBadge();
    }
  }
  /**
   * 显示加载动画
   */
  showLoading() {
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    if (!messagesContainer) {
      return;
    }
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "aurelia-loading";
    loadingDiv.id = "aurelia-loading";
    loadingDiv.innerHTML = `
      <div class="aurelia-loading-dot"></div>
      <div class="aurelia-loading-dot"></div>
      <div class="aurelia-loading-dot"></div>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  /**
   * 移除加载动画
   */
  hideLoading() {
    const loading = this.chatWindow?.querySelector("#aurelia-loading");
    loading?.remove();
  }
  /**
   * 显示错误
   */
  showError(message) {
    const messagesContainer = this.chatWindow?.querySelector(".aurelia-messages");
    if (!messagesContainer) {
      return;
    }
    const errorDiv = document.createElement("div");
    errorDiv.className = "aurelia-error";
    errorDiv.textContent = message;
    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    setTimeout(() => errorDiv.remove(), 5e3);
  }
  /**
   * 开始轮询新消息（人工接管后管理员发送的消息）
   */
  startPolling() {
    if (this.pollIntervalId)
      return;
    this.pollIntervalId = window.setInterval(() => this.pollMessages(), 3e3);
  }
  /**
   * 停止轮询
   */
  stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }
  /**
   * 轮询拉取新消息
   */
  async pollMessages() {
    if (!this.sessionId)
      return;
    try {
      const response = await fetch(
        `${this.config.apiBase}/api/v1/chat/messages?session_id=${encodeURIComponent(this.sessionId)}&after_id=${this.lastMessageId}&role=assistant`
      );
      if (!response.ok)
        return;
      const messages = await response.json();
      for (const msg of messages) {
        if (msg.content) {
          this.addMessage({
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content,
            sources: msg.sources,
            timestamp: /* @__PURE__ */ new Date()
          });
          if (!this.isOpen) {
            this.startTitleBlink();
          }
        }
        if (msg.id > this.lastMessageId) {
          this.lastMessageId = msg.id;
        }
      }
    } catch {
    }
  }
  /**
   * Unified cleanup after any stream termination path.
   * Hides transient UI states and removes incomplete streaming content.
   */
  cleanupAfterStreamError() {
    this.hideLoading();
    this.hideThinkingIndicator();
    this.removeStreamingMessage();
  }
  async consumeStream(response) {
    if (!response.body) {
      throw new Error("Streaming response body is unavailable");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamCompleted = false;
    const processEvent = (rawEvent) => {
      if (!rawEvent.trim()) {
        return;
      }
      let eventName = "message";
      const dataLines = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (!dataLines.length) {
        return;
      }
      const payload = JSON.parse(dataLines.join("\n"));
      switch (eventName) {
        case "sources":
          this.currentStreamSources = Array.isArray(payload.sources) ? payload.sources : [];
          break;
        case "thinking":
          this.showThinkingIndicator(typeof payload.elapsed === "number" ? payload.elapsed : 0);
          break;
        case "thinking_done":
          this.hideThinkingIndicator();
          break;
        case "content": {
          const contentChunk = payload.content || "";
          this.appendToStreamingMessage(contentChunk);
          break;
        }
        case "done": {
          const donePayload = payload;
          if (donePayload.session_id) {
            this.sessionId = donePayload.session_id;
            this.storage.setItem(this.STORAGE_KEY, donePayload.session_id);
            this.startPolling();
          }
          if (typeof donePayload.message_id === "number" && donePayload.message_id > this.lastMessageId) {
            this.lastMessageId = donePayload.message_id;
          }
          if (donePayload.taken_over) {
            this.removeStreamingMessage();
            this.addMessage({
              role: "assistant",
              content: this.getText("takenOverNotice"),
              timestamp: /* @__PURE__ */ new Date()
            });
          } else {
            this.finalizeStreamingMessage(this.currentStreamSources);
            if (!this.isOpen) {
              this.startTitleBlink();
            }
          }
          streamCompleted = true;
          break;
        }
        case "error": {
          const streamErrorPayload = payload;
          const streamError = new Error(streamErrorPayload.error || "Stream failed");
          if (streamErrorPayload.code) {
            streamError.name = streamErrorPayload.code;
          }
          throw streamError;
        }
        default:
          break;
      }
    };
    const findEventDelimiter = () => {
      const crlfIndex = buffer.indexOf("\r\n\r\n");
      const lfIndex = buffer.indexOf("\n\n");
      if (crlfIndex === -1 && lfIndex === -1) {
        return null;
      }
      if (crlfIndex === -1) {
        return { index: lfIndex, length: 2 };
      }
      if (lfIndex === -1) {
        return { index: crlfIndex, length: 4 };
      }
      return crlfIndex < lfIndex ? { index: crlfIndex, length: 4 } : { index: lfIndex, length: 2 };
    };
    const streamReadTimeout = 9e4;
    while (!streamCompleted) {
      if (this.streamAbortController?.signal.aborted) {
        reader.cancel();
        return;
      }
      let timeoutId = null;
      try {
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error("Stream read timeout")), streamReadTimeout);
          })
        ]);
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let delimiter = findEventDelimiter();
        while (delimiter) {
          const rawEvent = buffer.slice(0, delimiter.index);
          buffer = buffer.slice(delimiter.index + delimiter.length);
          processEvent(rawEvent.replace(/\r\n/g, "\n"));
          if (streamCompleted) {
            break;
          }
          delimiter = findEventDelimiter();
        }
        if (done) {
          break;
        }
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }
    }
    if (!streamCompleted) {
      if (buffer.trim()) {
        processEvent(buffer);
      }
      if (!streamCompleted) {
        throw new Error("Stream ended unexpectedly");
      }
    }
  }
  /**
   * Abort the active stream and release the reader lock.
   */
  abortStream() {
    this.streamAbortController?.abort();
    this.streamAbortController = null;
  }
  /**
   * 发送消息
   */
  async sendMessageWithRetry(message) {
    let lastError = null;
    for (let attempt = 0; attempt <= 1; attempt++) {
      this.abortStream();
      this.streamAbortController = new AbortController();
      try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(`${this.config.apiBase}/api/v1/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
          },
          signal: this.streamAbortController.signal,
          body: JSON.stringify({
            agent_id: this.config.agentId,
            message,
            locale: this.getRequestLocale(),
            session_id: this.sessionId || void 0,
            visitor_id: this.visitorId,
            timezone: userTimezone
          })
        });
        if (!response.ok) {
          let detail = `HTTP ${response.status}: ${response.statusText}`;
          try {
            const errorPayload = await response.json();
            detail = errorPayload.message || errorPayload.detail || detail;
          } catch {
          }
          throw new Error(detail);
        }
        this.hideLoading();
        await this.consumeStream(response);
        return;
      } catch (error) {
        lastError = error;
        const errorText = String(error?.message || "");
        const hasPartialContent = this.currentStreamContent.trim().length > 0;
        const isRetryable = !hasPartialContent && (error instanceof TypeError || errorText.includes("fetch") || errorText.includes("Failed to fetch") || errorText.includes("Stream ended unexpectedly"));
        if (!isRetryable || attempt >= 1) {
          this.cleanupAfterStreamError();
          throw error;
        }
        this.cleanupAfterStreamError();
        console.warn(`[Aurelia Widget] Stream attempt ${attempt + 1} failed, retrying...`);
        await new Promise((resolve) => window.setTimeout(resolve, 1e3));
        this.showLoading();
      }
    }
    throw lastError;
  }
  async sendMessage(message) {
    if (this.isSending) {
      return;
    }
    this.isSending = true;
    this.addMessage({
      role: "user",
      content: message,
      timestamp: /* @__PURE__ */ new Date()
    });
    this.hideLoading();
    this.hideThinkingIndicator();
    this.removeStreamingMessage();
    this.createStreamingMessage(true);
    try {
      await this.sendMessageWithRetry(message);
    } catch (error) {
      console.error("[Aurelia Widget] Error sending message:", error);
      let errorMessage = this.getText("sendFailed");
      let consoleHint = "";
      const errorText = String(error?.message || "");
      if (error instanceof TypeError || errorText.includes("fetch")) {
        errorMessage = this.getText("networkError");
        consoleHint = `Request may be blocked by CORS, network connectivity, or an incorrect apiBase. Current apiBase: ${this.config.apiBase || "(not set)"}`;
      } else if (errorText.includes("429") || errorText.toLowerCase().includes("quota")) {
        errorMessage = this.getText("quotaExceeded");
      } else if (error?.name === "ORIGIN_NOT_ALLOWED" || errorText.toLowerCase().includes("widget origin not allowed")) {
        errorMessage = this.getText("sendFailed");
        consoleHint = "Widget request was blocked because the current page origin is not on the allowed domain list.";
      } else if (errorText.includes("401")) {
        consoleHint = "Authentication failed. Please check the agent configuration and public API access.";
      }
      if (!this.config.apiBase) {
        consoleHint = "apiBase could not be determined. When embedding the widget from a local file, set apiBase explicitly or load the SDK from the target server.";
      }
      if (consoleHint) {
        console.error("[Aurelia Widget]", consoleHint);
      }
      this.showError(errorMessage);
    } finally {
      this.isSending = false;
    }
  }
  /**
   * 销毁Widget
   */
  destroy() {
    this.stopPolling();
    this.stopTitleBlink();
    this.hideThinkingIndicator();
    this.removeStreamingMessage();
    this.abortStream();
    if (this.button && this._buttonClickListener) {
      this.button.removeEventListener("click", this._buttonClickListener);
    }
    const closeBtn = this.chatWindow?.querySelector(".aurelia-close");
    if (closeBtn && this._closeBtnClickListener) {
      closeBtn.removeEventListener("click", this._closeBtnClickListener);
    }
    const sendBtn = this.chatWindow?.querySelector(".aurelia-send");
    if (sendBtn && this._sendBtnClickListener) {
      sendBtn.removeEventListener("click", this._sendBtnClickListener);
    }
    const input = this.chatWindow?.querySelector(".aurelia-input");
    if (input && this._inputKeypressListener) {
      input.removeEventListener("keypress", this._inputKeypressListener);
    }
    this.container?.remove();
    const styles = document.getElementById("aurelia-widget-styles");
    styles?.remove();
  }
};
window.AureliaWidget = AureliaWidget;
function getSearchParamValue(searchParams, keys) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
function findAutoInitScript() {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  const scripts = Array.from(document.querySelectorAll("script[src]"));
  for (let index = scripts.length - 1; index >= 0; index -= 1) {
    const script = scripts[index];
    const src = script.getAttribute("src") || "";
    if (!src.includes("sdk.js")) {
      continue;
    }
    try {
      const url = new URL(src, window.location.href);
      if (getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.agentId)) {
        return script;
      }
    } catch {
      continue;
    }
  }
  return null;
}
function getAutoInitConfig(script) {
  const src = script.getAttribute("src") || script.src;
  if (!src) {
    return null;
  }
  let url;
  try {
    url = new URL(src, window.location.href);
  } catch {
    return null;
  }
  const agentId = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.agentId);
  if (!agentId) {
    return null;
  }
  const config = { agentId };
  const apiBase = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.apiBase);
  if (apiBase) {
    config.apiBase = apiBase;
  }
  const themeColor = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.themeColor);
  if (themeColor) {
    config.themeColor = themeColor;
  }
  const welcomeMessage = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.welcomeMessage);
  if (welcomeMessage) {
    config.welcomeMessage = welcomeMessage;
  }
  const language = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.language);
  if (language) {
    config.language = language;
  }
  const position = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.position);
  if (position === "left" || position === "right") {
    config.position = position;
  }
  const theme = getSearchParamValue(url.searchParams, AUTO_INIT_SCRIPT_PARAM_MAP.theme);
  if (theme === "light" || theme === "dark" || theme === "auto") {
    config.theme = theme;
  }
  return config;
}
(function bootstrapAureliaWidget() {
  const globalWindow = window;
  const script = findAutoInitScript();
  if (!script) {
    return;
  }
  const config = getAutoInitConfig(script);
  if (!config) {
    return;
  }
  if (globalWindow.__aureliaWidgetAutoInitScheduled) {
    return;
  }
  globalWindow.__aureliaWidgetAutoInitScheduled = true;
  const start = () => {
    void new AureliaWidget(config).init();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  start();
})();
//# sourceMappingURL=aurelia-widget.js.map
