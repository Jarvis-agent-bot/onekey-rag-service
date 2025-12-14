import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";

type Role = "user" | "assistant";

type SourceItem = {
  ref?: number | null;
  url: string;
  title?: string;
  section_path?: string;
  snippet?: string;
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
};

type OpenAIListModelsResponse = {
  object: "list";
  data: Array<{
    id: string;
    object: "model";
    owned_by?: string;
    meta?: Record<string, unknown>;
  }>;
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
  // 把正文里的 [n] 替换成一个 markdown link：[[n]](#cite-n)
  // 这样在渲染 <a> 时可以识别为“引用”，并做成 tooltip/弹窗。
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
    out.push(line.replace(/\[(\d{1,3})\]/g, (_m, n) => `[[${n}]](#cite-${n})`));
  }
  return out.join("\n");
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

export default function App() {
  const sp = useMemo(() => new URLSearchParams(window.location.search), []);
  const queryTitle = sp.get("title") || "OneKey 文档助手";
  const initialModel = sp.get("model") || "onekey-docs";
  const parentOrigin = sp.get("parent_origin") || "";
  const apiBase = sp.get("api_base") || "";

  const [title] = useState(queryTitle);
  const [pageUrl, setPageUrl] = useState<string>("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>(() => localStorage.getItem("onekey_rag_widget_model") || initialModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string>("");
  const [openSourcesFor, setOpenSourcesFor] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<{ ref: number; x: number; y: number; msgId: string } | null>(
    null
  );

  const conversationIdRef = useRef<string>(
    localStorage.getItem("onekey_rag_widget_conversation_id") || safeRandomId("conv")
  );
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const apiModelsUrl = joinUrl(apiBase, "/v1/models");
  const apiChatUrl = joinUrl(apiBase, "/v1/chat/completions");
  const apiFeedbackUrl = joinUrl(apiBase, "/v1/feedback");

  useEffect(() => {
    localStorage.setItem("onekey_rag_widget_conversation_id", conversationIdRef.current);
  }, []);

  useEffect(() => {
    localStorage.setItem("onekey_rag_widget_model", model);
  }, [model]);

  useEffect(() => {
    // 拉取模型列表（失败则忽略）
    fetchJson<OpenAIListModelsResponse>(apiModelsUrl)
      .then((data) => {
        const ids = (data?.data || []).map((m) => m.id).filter(Boolean);
        setModels(ids.length ? ids : [initialModel]);
      })
      .catch(() => {
        setModels([initialModel]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiModelsUrl]);

  useEffect(() => {
    // 监听父页面传入上下文
    function onMessage(event: MessageEvent) {
      if (parentOrigin && event.origin !== parentOrigin) return;
      const data = event.data as any;
      if (!data || typeof data !== "object") return;
      if (data.type === "onekey_rag_widget:context") {
        if (typeof data.page_url === "string") setPageUrl(data.page_url);
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveCitation(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function sendFeedback(msg: ChatMessage, rating: "up" | "down", reason?: string) {
    if (!msg.completionId) return;
    const urls = (msg.sources || []).map((s) => s.url).filter(Boolean);
    await fetchJson(apiFeedbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationIdRef.current,
        message_id: msg.completionId,
        rating,
        reason: reason || "",
        comment: "",
        sources: urls,
      }),
    });
  }

  async function onSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (isStreaming) {
      abortRef.current?.abort();
    }

    setErrorBanner("");
    setInput("");

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
      model,
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

  function onStop() {
    abortRef.current?.abort();
  }

  function onClear() {
    if (isStreaming) abortRef.current?.abort();
    setMessages([]);
    setErrorBanner("");
  }

  function requestClose() {
    try {
      window.parent?.postMessage({ type: "onekey_rag_widget:close" }, parentOrigin || "*");
    } catch {
      // ignore
    }
  }

  function renderCitationLink(href: string, children: React.ReactNode, msg: ChatMessage) {
    const m = /^#cite-(\d{1,3})$/.exec(href);
    if (!m) return null;
    const ref = Number(m[1]);
    const source = (msg.sources || []).find((s) => (s.ref ?? undefined) === ref);

    return (
      <button
        type="button"
        className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          setActiveCitation({ ref, x: rect.left + rect.width / 2, y: rect.bottom + 8, msgId: msg.localId });
          setOpenSourcesFor(msg.localId);
        }}
        onMouseEnter={(e) => {
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          setActiveCitation({ ref, x: rect.left + rect.width / 2, y: rect.bottom + 8, msgId: msg.localId });
        }}
        onMouseLeave={() => {
          // 鼠标离开不立即关闭，避免抖动；让用户能移动到弹层上
          // 由弹层自身的 mouseleave / ESC 控制
        }}
        aria-label={`引用 ${ref}`}
      >
        {children}
      </button>
    );
  }

  function citationPopover() {
    if (!activeCitation) return null;
    const msg = messages.find((m) => m.localId === activeCitation.msgId);
    const source = msg?.sources?.find((s) => (s.ref ?? undefined) === activeCitation.ref);

    const style: React.CSSProperties = {
      position: "fixed",
      left: activeCitation.x,
      top: activeCitation.y,
      transform: "translateX(-50%)",
      zIndex: 999999,
    };

    return (
      <div
        style={style}
        className="w-[320px] max-w-[calc(100vw-32px)] rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-sm text-slate-100 shadow-2xl backdrop-blur"
        onMouseLeave={() => setActiveCitation(null)}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-200">引用 [{activeCitation.ref}]</div>
          <button
            type="button"
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
            onClick={() => setActiveCitation(null)}
          >
            关闭
          </button>
        </div>
        {source ? (
          <>
            <div className="truncate text-xs font-semibold text-slate-100" title={source.title || source.url}>
              {source.title || source.section_path || source.url}
            </div>
            {source.snippet ? <div className="mt-2 text-xs text-slate-300">{source.snippet}</div> : null}
            <div className="mt-2">
              <a
                className="text-xs font-medium text-blue-300 underline"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                打开来源
              </a>
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-300">来源尚未返回（流式结束前会下发 sources）。</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-transparent text-slate-100">
      {citationPopover()}

      <div className="flex items-center gap-3 border-b border-white/10 bg-slate-900/30 px-4 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          {pageUrl ? <div className="truncate text-xs text-slate-400">{pageUrl}</div> : null}
        </div>
        <select
          className="h-9 max-w-[220px] rounded-md border border-white/10 bg-slate-900/60 px-2 text-sm text-slate-100"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isStreaming}
          aria-label="选择模型"
        >
          {(models.length ? models : [initialModel]).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={onClear} disabled={isStreaming} title="清空会话">
          清空
        </Button>
        <Button variant="ghost" onClick={requestClose} title="关闭">
          关闭
        </Button>
      </div>

      {errorBanner ? (
        <div className="border-b border-white/10 bg-red-500/10 px-4 py-2 text-xs text-red-200">{errorBanner}</div>
      ) : (
        <div className="border-b border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300">
          本助手回答基于 OneKey 开发者文档内容生成；请以引用链接为准。
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4 text-sm text-slate-200 backdrop-blur">
            <div className="text-base font-semibold">Hi!</div>
            <div className="mt-2 text-sm text-slate-300">
              我是 OneKey 文档助手，可以帮你查找 SDK/API/集成指南并给出可追溯引用。
            </div>
            <div className="mt-4 text-xs font-semibold text-slate-300">示例问题</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "如何在项目里集成 OneKey Connect？",
                "WebUSB 权限需要注意什么？",
                "如何发现设备并获取 connectId？",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
                  onClick={() => setInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {messages.map((m) => (
            <div key={m.localId} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={[
                  "max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                  m.role === "user"
                    ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
                    : "border border-white/10 bg-slate-900/30 text-slate-100 backdrop-blur",
                ].join(" ")}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-invert max-w-none prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-black/40 prose-pre:text-slate-100">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children, ...rest }) => {
                          const hrefStr = typeof href === "string" ? href : "";
                          const maybeCitation = hrefStr.startsWith("#cite-")
                            ? renderCitationLink(hrefStr, children, m)
                            : null;
                          if (maybeCitation) return maybeCitation;
                          return (
                            <a
                              href={href}
                              target={hrefStr.startsWith("#") ? undefined : "_blank"}
                              rel={hrefStr.startsWith("#") ? undefined : "noreferrer"}
                              className="underline decoration-white/30 underline-offset-4 hover:decoration-white/60"
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
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}

                {m.role === "assistant" && m.status === "error" ? (
                  <div className="mt-2 text-xs text-red-200">生成失败：{m.errorText}</div>
                ) : null}

                {m.role === "assistant" && (m.sources?.length || 0) > 0 ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900/60"
                      onClick={() => setOpenSourcesFor((cur) => (cur === m.localId ? null : m.localId))}
                    >
                      来源（{m.sources?.length || 0}）
                    </button>
                    {openSourcesFor === m.localId ? (
                      <div className="mt-2 space-y-2">
                        {(m.sources || []).map((s) => {
                          const ref = s.ref ?? undefined;
                          return (
                            <div
                              key={`${ref || "x"}:${s.url}`}
                              className="rounded-xl border border-white/10 bg-black/20 p-3"
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 min-w-[28px] text-xs font-semibold text-slate-200">
                                  {ref ? `[${ref}]` : ""}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate text-xs font-semibold text-slate-100 underline decoration-white/20 underline-offset-4 hover:decoration-white/50"
                                    title={s.url}
                                  >
                                    {s.title || s.section_path || s.url}
                                  </a>
                                  {s.snippet ? <div className="mt-1 text-xs text-slate-300">{s.snippet}</div> : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {m.role === "assistant" && m.status === "done" ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendFeedback(m, "up").catch(() => {})}
                      disabled={!m.completionId}
                    >
                      有帮助
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendFeedback(m, "down", "sources_irrelevant").catch(() => {})}
                      disabled={!m.completionId}
                    >
                      没帮助
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 bg-slate-900/30 px-4 py-4 backdrop-blur">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的问题（回车发送，Shift+Enter 换行）"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend().catch(() => {});
              }
            }}
            disabled={isStreaming}
            className="bg-slate-900/50 text-slate-100 placeholder:text-slate-500 border-white/10 focus:ring-blue-500"
          />
          <div className="flex flex-col gap-2">
            <Button onClick={() => onSend().catch(() => {})} disabled={isStreaming || !input.trim()}>
              发送
            </Button>
            <Button variant="outline" onClick={onStop} disabled={!isStreaming}>
              停止
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          引用编号如 <span className="font-mono">[1]</span> 会以内联形式出现，可悬浮/点击查看来源片段与链接。
        </div>
      </div>
    </div>
  );
}
