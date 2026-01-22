import type { ReactNode } from "react";
import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  SendHorizonal,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
} from "lucide-react";

type Role = "user" | "assistant";

type SourceItem = {
  ref?: number | null;
  url: string;
  title?: string;
  section_path?: string;
  snippet?: string;
};

type ModelItem = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  root: string;
  parent: string | null;
  meta?: {
    app_id?: string;
    upstream_model?: string;
    base_url?: string;
  };
};

type ChatMessage = {
  localId: string;
  role: Role;
  content: string;
  createdAt: number;
  completionId?: string; // 后端返回的 chatcmpl id（用于 feedback）
  sources?: SourceItem[];
  status?: "streaming" | "done" | "error" | "aborted";
  errorText?: string;
  feedback?: "up" | "down";
};

function nowMs() {
  return Date.now();
}

function safeRandomId(prefix: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCrypto: any = crypto;
    if (anyCrypto && typeof anyCrypto.randomUUID === "function") return `${prefix}_${anyCrypto.randomUUID()}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

function joinUrl(base: string, path: string) {
  if (!base) return path;
  return base.replace(/\/+$/, "") + path;
}

function linkCitationsForMarkdown(text: string) {
  // 把正文里的 [n] 替换成一个 markdown link：<n>(#cite-n)
  // 这样在渲染 <a> 时可以识别为“引用”，并做成内联引用样式。
  const lines = (text || "").split("\n");
  let inFence = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // 避免误伤 inline code：按 ` 分割，仅替换非 code 片段
    const segs = line.split("`");
    for (let i = 0; i < segs.length; i += 2) {
      // 避免误伤 markdown link：排除 "[n](" 这种情况
      segs[i] = segs[i].replace(/\[(\d{1,3})\](?!\()/g, (_m, n) => `[${n}](#cite-${n})`);
    }
    out.push(segs.join("`"));
  }
  return out.join("\n");
}

function remarkNormalizeInlineCode() {
  return (tree: any) => {
    const visit = (node: any) => {
      if (!node) return;
      if (node.type === "inlineCode" && typeof node.value === "string") {
        const raw = node.value.trim();
        if (raw.startsWith("`") && raw.endsWith("`") && raw.length > 1) {
          node.value = raw.slice(1, -1).trim();
        }
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`);
  }
  return (await resp.json()) as T;
}

type StreamCallbacks = {
  onChunk: (delta: { content?: string; id?: string }) => void;
  onSources: (sources: SourceItem[], id?: string) => void;
  onDone: () => void;
};

async function streamSSE(url: string, body: unknown, signal: AbortSignal, cb: StreamCallbacks) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`);
  }
  if (!resp.body) throw new Error("流式响应缺少 body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      const lines = raw.split("\n");
      const dataLines = lines.filter((l) => l.startsWith("data:"));
      if (!dataLines.length) continue;
      const data = dataLines.map((l) => l.slice(5).trimStart()).join("\n").trim();
      if (!data) continue;
      if (data === "[DONE]") {
        cb.onDone();
        return;
      }
      let obj: any;
      try {
        obj = JSON.parse(data);
      } catch {
        continue;
      }

      if (obj && obj.object === "chat.completion.chunk") {
        const id = obj.id as string | undefined;
        const delta = obj.choices?.[0]?.delta ?? {};
        const content = delta.content as string | undefined;
        if (content) cb.onChunk({ content, id });
        else if (id) cb.onChunk({ id });
      } else if (obj && obj.object === "chat.completion.sources") {
        const id = obj.id as string | undefined;
        const sources = (obj.sources || []) as SourceItem[];
        cb.onSources(sources, id);
      }
    }
  }
  cb.onDone();
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 兼容旧浏览器：使用 document.execCommand('copy')
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "true");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseUrl(url: string) {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}${u.hash}`.replace(/\/$/, "");
    return { host: u.host, path: path || "/" };
  } catch {
    return { host: "", path: url };
  }
}

function getSourceRef(s: SourceItem, idx: number) {
  const r = typeof s.ref === "number" ? s.ref : null;
  if (r && r > 0) return r;
  return idx + 1;
}

export default function App() {
  const sp = useMemo(() => new URLSearchParams(window.location.search), []);
  const title = sp.get("title") || "Ask AI";
  const defaultModel = sp.get("model") || "onekey-docs";
  const parentOrigin = sp.get("parent_origin") || "";
  const apiBase = sp.get("api_base") || "";
  const contactUrl = sp.get("contact_url") || "https://onekey.so";
  const oneKeyLogoUrl = "./onekey.png";

  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const [pageUrl, setPageUrl] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string>("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const [feedbackSendingId, setFeedbackSendingId] = useState<string | null>(null);

  const conversationIdRef = useRef<string>(
    localStorage.getItem("onekey_rag_widget_conversation_id") || safeRandomId("conv")
  );
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoScrollRef = useRef<boolean>(true);

  const apiChatUrl = joinUrl(apiBase, "/v1/chat/completions");
  const apiFeedbackUrl = joinUrl(apiBase, "/v1/feedback");
  const apiModelsUrl = joinUrl(apiBase, "/v1/models");

  useEffect(() => {
    localStorage.setItem("onekey_rag_widget_conversation_id", conversationIdRef.current);
  }, []);

  useEffect(() => {
    // 获取应用列表
    fetchJson<{ object: string; data: ModelItem[] }>(apiModelsUrl)
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setModels(res.data);
          // 如果默认模型在列表中，使用默认模型；否则使用列表第一个
          const found = res.data.find((m) => m.id === defaultModel);
          if (!found) {
            setSelectedModel(res.data[0].id);
          }
        }
      })
      .catch((e) => {
        console.error("Failed to fetch models:", e);
      });
  }, [apiModelsUrl, defaultModel]);

  useEffect(() => {
    // 监听父页面传入上下文
    function onMessage(event: MessageEvent) {
      if (parentOrigin && event.origin !== parentOrigin) return;
      const data = event.data as any;
      if (!data || typeof data !== "object") return;
      if (data.type === "onekey_rag_widget:context") {
        if (typeof data.page_url === "string") setPageUrl(data.page_url);
        return;
      }
      if (data.type === "onekey_rag_widget:host_closed") {
        abortRef.current?.abort();
        setIsStreaming(false);
        return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [parentOrigin]);

  useEffect(() => {
    // 主动向父页面请求上下文
    try {
      window.parent?.postMessage({ type: "onekey_rag_widget:request_context" }, parentOrigin || "*");
    } catch {
      // ignore
    }
  }, [parentOrigin]);

  useEffect(() => {
    // 自动滚动到底部
    const el = scrollRef.current;
    if (!el) return;
    if (!autoScrollRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: isStreaming ? "auto" : "smooth" });
  }, [messages, isStreaming]);

  function isAtBottom(el: HTMLDivElement) {
    const threshold = 48; // px
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }

  useEffect(() => {
    // 自动调整输入框高度（上限）
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${clamp(el.scrollHeight, 44, 140)}px`;
  }, [input]);

  function requestClose() {
    abortRef.current?.abort();
    try {
      window.parent?.postMessage({ type: "onekey_rag_widget:close" }, parentOrigin || "*");
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendFeedback(msg: ChatMessage, rating: "up" | "down") {
    if (!msg.completionId) return;
    if (msg.feedback === rating) return; // 已选同一评价，不再重复提交
    const urls = (msg.sources || []).map((s) => s.url).filter(Boolean);
    setFeedbackSendingId(msg.localId);
    try {
      await fetchJson(apiFeedbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationIdRef.current,
          message_id: msg.completionId,
          rating,
          reason: "",
          comment: "",
          sources: urls,
        }),
      });
      setMessages((prev) =>
        prev.map((m) => (m.localId === msg.localId ? { ...m, feedback: rating } : m))
      );
    } catch (e) {
      // 失败时不抛出，避免打断会话；可在此处按需显示提示
      console.error("sendFeedback failed", e);
    } finally {
      setFeedbackSendingId((cur) => (cur === msg.localId ? null : cur));
    }
  }

  async function onClear() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages([]);
    setErrorBanner("");
    setCopiedMessageId(null);
    setCopiedCodeKey(null);
    setHighlightedSourceId(null);
    autoScrollRef.current = true;
  }

  async function copyMessage(msg: ChatMessage) {
    const ok = await copyToClipboard(msg.content || "");
    if (!ok) return;
    setCopiedMessageId(msg.localId);
    window.setTimeout(() => setCopiedMessageId((cur) => (cur === msg.localId ? null : cur)), 1200);
  }

  async function onSend() {
    if (isStreaming) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setErrorBanner("");
    setInput("");
    autoScrollRef.current = true;

    const userMsg: ChatMessage = { localId: safeRandomId("m"), role: "user", content: trimmed, createdAt: nowMs() };
    const assistantLocalId = safeRandomId("m");
    const assistantMsg: ChatMessage = {
      localId: assistantLocalId,
      role: "assistant",
      content: "",
      createdAt: nowMs(),
      status: "streaming",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const openaiMessages = [...messages, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const body = {
      model: selectedModel,
      messages: openaiMessages,
      stream: true,
      metadata: pageUrl ? { page_url: pageUrl } : {},
    };

    let completionId: string | undefined;
    try {
      await streamSSE(apiChatUrl, body, controller.signal, {
        onChunk: ({ content, id }) => {
          if (id) completionId = id;
          if (!content) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.localId === assistantLocalId
                ? { ...m, content: m.content + content, completionId: completionId || m.completionId }
                : m
            )
          );
        },
        onSources: (sources, id) => {
          if (id) completionId = id;
          setMessages((prev) =>
            prev.map((m) =>
              m.localId === assistantLocalId
                ? { ...m, sources, completionId: completionId || m.completionId }
                : m
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.localId === assistantLocalId ? { ...m, status: controller.signal.aborted ? "aborted" : "done" } : m
            )
          );
          setIsStreaming(false);
          abortRef.current = null;
        },
      });
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) => (m.localId === assistantLocalId ? { ...m, status: "aborted" } : m))
        );
        setIsStreaming(false);
        abortRef.current = null;
        return;
      }
      const errText = e?.message || String(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.localId === assistantLocalId ? { ...m, status: "error", errorText: errText } : m
        )
      );
      setErrorBanner(errText);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function getSourceCardId(msgLocalId: string, ref: number) {
    return `source-${msgLocalId}-${ref}`;
  }

  function highlightSource(id: string) {
    setHighlightedSourceId(id);
    window.setTimeout(() => setHighlightedSourceId((cur) => (cur === id ? null : cur)), 1600);
  }

  function jumpToSource(msg: ChatMessage, ref: number) {
    const id = getSourceCardId(msg.localId, ref);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightSource(id);
      return;
    }

    const sources = msg.sources || [];
    let target: SourceItem | undefined;
    for (let i = 0; i < sources.length; i += 1) {
      if (getSourceRef(sources[i], i) === ref) {
        target = sources[i];
        break;
      }
    }
    if (target?.url) window.open(target.url, "_blank", "noreferrer");
  }

  function renderCitationLink(href: string, children: ReactNode, msg: ChatMessage) {
    const m = /^#cite-(\d{1,3})$/.exec(href);
    if (!m) return null;
    const ref = Number(m[1]);
    const hasSources = !!(msg.sources && msg.sources.length > 0);

    return (
      <button
        type="button"
        className="mx-0.5 inline-flex h-4 w-4 -translate-y-0.5 items-center justify-center rounded-[4px] border border-white/10 bg-white/5 text-[10px] font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!hasSources}
        onClick={() => jumpToSource(msg, ref)}
        aria-label={`引用 ${ref}`}
      >
        {children}
      </button>
    );
  }

  function Avatar({ role }: { role: Role }) {
    if (role === "user") {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <User size={16} className="text-slate-200" />
        </div>
      );
    }
    return (
      <div className="h-8 w-8 overflow-hidden rounded-xl">
        <img src={oneKeyLogoUrl} alt="OneKey" className="h-8 w-8" />
      </div>
    );
  }

  function IconButton({
    label,
    disabled,
    onClick,
    active,
    children,
  }: {
    label: string;
    disabled?: boolean;
    onClick?: () => void;
    active?: boolean;
    children: ReactNode;
  }) {
    return (
      <button
        type="button"
        className={[
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white/5 text-slate-200 transition-all duration-200",
          active ? "border-blue-400/60 bg-blue-500/15 text-blue-100" : "border-white/10 hover:bg-white/10",
          disabled ? "cursor-not-allowed opacity-40" : "hover:-translate-y-[1px]",
        ].join(" ")}
        aria-label={label}
        title={label}
        aria-pressed={active ? "true" : "false"}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  function StreamingIndicator() {
    return (
      <div
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-300 typing-dots"
        aria-label="生成中"
      >
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    );
  }

  const extractText = (node: ReactNode): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (typeof node === "object" && "props" in node) return extractText((node as any).props?.children);
    return "";
  };

  const normalizeClassName = (value: unknown) => {
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "string") return value;
    return "";
  };

  function CodeBlock({ children }: { children: ReactNode }) {
    const codeElement =
      Children.toArray(children).find((child) => isValidElement(child) && child.type === "code") ?? null;
    const codeClassName =
      codeElement && isValidElement(codeElement) ? normalizeClassName(codeElement.props.className) : "";
    const match = /language-(\w+)/.exec(codeClassName || "");
    const lang = (match?.[1] || "").toLowerCase();
    const codeText = extractText(codeElement?.props?.children ?? children).replace(/\r\n/g, "\n").replace(/\n+$/, "");
    const copyKey = `${lang}:${codeText.slice(0, 48)}`;
    const codeNode =
      codeElement && isValidElement(codeElement)
        ? cloneElement(codeElement, {
            className: [normalizeClassName(codeElement.props.className), "font-mono text-slate-100"]
              .filter(Boolean)
              .join(" "),
          })
        : (
          <code className="font-mono text-slate-100">{children}</code>
        );

    return (
      <div className="not-prose my-3 overflow-hidden rounded-xl border border-white/10 bg-[#1f2532]">
        <div className="flex items-center justify-between bg-[#1a202c] px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wide text-white/55">{lang || "text"}</div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            aria-label="复制代码"
            title="复制代码"
            onClick={() => {
              copyToClipboard(codeText).then((ok) => {
                if (!ok) return;
                setCopiedCodeKey(copyKey);
                window.setTimeout(() => setCopiedCodeKey((cur) => (cur === copyKey ? null : cur)), 1200);
              });
            }}
          >
            {copiedCodeKey === copyKey ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-6">{codeNode}</pre>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0c1220] text-slate-100">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-white">Ask AI</div>
            {models.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                >
                  <span className="max-w-[120px] truncate">{selectedModel}</span>
                  <ChevronDown size={14} className={`transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {modelDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setModelDropdownOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-60 min-w-[160px] overflow-y-auto rounded-lg border border-white/10 bg-[#1a202c] py-1 shadow-lg">
                      {models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={[
                            "w-full px-3 py-2 text-left text-xs hover:bg-white/10",
                            selectedModel === m.id ? "bg-white/5 text-blue-300" : "text-slate-200",
                          ].join(" ")}
                          onClick={() => {
                            setSelectedModel(m.id);
                            setModelDropdownOpen(false);
                            // 切换应用时清空对话
                            onClear();
                          }}
                        >
                          {m.id}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/10"
            aria-label="关闭"
            title="关闭"
            onClick={requestClose}
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-x-hidden overflow-y-auto px-5 py-5"
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            autoScrollRef.current = isAtBottom(el);
          }}
        >
        {errorBanner ? (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {errorBanner}
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-base font-semibold text-white">Hi!</div>
            <div className="mt-2 text-sm text-slate-300">我会基于 OneKey 开发者文档回答你的问题，并给出可追溯的来源引用。</div>
            <div className="mt-5 text-xs font-semibold text-slate-300">示例问题</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "如何接入 OneKey 硬件钱包？",
                "移动端如何与 OneKey 硬件通讯？",
                "如何在 dApp 中接入 OneKey Connect？",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                  onClick={() => {
                    setInput(q);
                    textareaRef.current?.focus();
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {messages.map((m) => (
              <div key={m.localId} className="py-5">
                <div className="flex gap-3">
                  <Avatar role={m.role} />
                  <div className="min-w-0 flex-1">
                    {m.role === "user" ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{m.content}</div>
                    ) : (
                      <div className="prose prose-invert max-w-none break-words overflow-x-hidden text-sm prose-a:font-medium prose-a:text-blue-300 hover:prose-a:text-blue-200 prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkNormalizeInlineCode]}
                          rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
                          components={{
                            pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                            a: ({ href, children, ...rest }) => {
                              const hrefStr = typeof href === "string" ? href : "";
                              const maybeCitation = hrefStr.startsWith("#cite-") ? renderCitationLink(hrefStr, children, m) : null;
                              if (maybeCitation) return maybeCitation;
                              return (
                                <a
                                  href={href}
                                  target={hrefStr.startsWith("#") ? undefined : "_blank"}
                                  rel={hrefStr.startsWith("#") ? undefined : "noreferrer"}
                                  className="underline decoration-white/20 underline-offset-4 hover:decoration-white/40"
                                  {...rest}
                                >
                                  {children}
                                </a>
                              );
                            },
                          }}
                        >
                          {linkCitationsForMarkdown(m.content)}
                        </ReactMarkdown>
                      </div>
                    )}

                    {m.role === "assistant" && m.status === "streaming" && !m.content ? <StreamingIndicator /> : null}

                    {m.role === "assistant" && m.status === "error" ? (
                      <div className="mt-2 text-xs text-red-200">生成失败：{m.errorText}</div>
                    ) : null}

                    {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-300">Sources</div>
                        <div className="mt-2 grid gap-2">
                          {m.sources.map((s, idx) => {
                            const ref = getSourceRef(s, idx);
                            const id = getSourceCardId(m.localId, ref);
                            const { host, path } = parseUrl(s.url);
                            const label = (s.title || s.section_path || path || s.url || "").trim();
                            return (
                              <a
                                key={id}
                                id={id}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className={[
                                  "group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10",
                                  highlightedSourceId === id ? "ring-2 ring-blue-500/40" : "",
                                ].join(" ")}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[11px] font-semibold text-slate-100">
                                    {ref}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-medium text-slate-100">{label}</div>
                                    <div className="truncate text-[11px] text-slate-400">{host ? `${host}${path}` : path}</div>
                                  </div>
                                </div>
                                <ExternalLink size={14} className="shrink-0 text-slate-400 group-hover:text-slate-200" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {m.role === "assistant" && m.status === "done" ? (
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <IconButton
                          label={copiedMessageId === m.localId ? "已复制" : "复制"}
                          onClick={() => copyMessage(m).catch(() => { })}
                        >
                          {copiedMessageId === m.localId ? <Check size={16} /> : <Copy size={16} />}
                        </IconButton>
                        <IconButton
                          label="有帮助"
                          disabled={!m.completionId || feedbackSendingId === m.localId}
                          active={m.feedback === "up"}
                          onClick={() => sendFeedback(m, "up").catch(() => { })}
                        >
                          <ThumbsUp size={16} fill={m.feedback === "up" ? "currentColor" : "none"} />
                        </IconButton>
                        <IconButton
                          label="没帮助"
                          disabled={!m.completionId || feedbackSendingId === m.localId}
                          active={m.feedback === "down"}
                          onClick={() => sendFeedback(m, "down").catch(() => { })}
                        >
                          <ThumbsDown size={16} fill={m.feedback === "down" ? "currentColor" : "none"} />
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-5 pt-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题（回车发送，Shift+Enter 换行）"
              className="min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
              rows={1}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                const nativeEvent = e.nativeEvent as KeyboardEvent;
                if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return; // 中文输入法时不触发发送
                e.preventDefault();
                onSend().catch(() => { });
              }}
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-slate-100 transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="发送"
              title="发送"
              disabled={isStreaming || !input.trim()}
              onClick={() => onSend().catch(() => { })}
            >
              <SendHorizonal size={18} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <a
              className="flex items-center gap-1 font-semibold text-slate-200 hover:text-white"
              href="https://onekey.so"
              target="_blank"
              rel="noreferrer"
            >
              <img src={oneKeyLogoUrl} alt="OneKey" className="h-3.5 w-3.5" />
              OneKey
            </a>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-slate-300 hover:text-white disabled:opacity-40"
              onClick={() => onClear().catch(() => { })}
              disabled={messages.length === 0}
            >
              Clear
            </button>
            <a className="text-slate-300 hover:text-white" href={contactUrl} target="_blank" rel="noreferrer">
              Contact us
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
