import { useEffect, useState } from "react";
import {
  ApiError,
  approveDraft,
  getAgentConversation,
  getMe,
  listConversations,
  login,
  logout,
  retryDraft
} from "../api";
import type {
  Agent,
  AgentConversation,
  ConversationListItem,
  Draft,
  Message
} from "../types";

function formatTime(value: string, includeDate = false) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(includeDate ? { day: "numeric", month: "short" } : {})
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function LoginPanel({ onLogin }: { onLogin: (agent: Agent) => void }) {
  const [email, setEmail] = useState("agent@verdant.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onLogin(await login(email, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 place-items-center px-4 py-12">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-[32px] border border-emerald-950/8 bg-white shadow-[0_24px_80px_rgba(28,55,43,0.12)] md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative hidden overflow-hidden bg-emerald-950 p-10 text-white md:block">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-emerald-800/60 blur-2xl" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                Agent workspace
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight">
                Thoughtful replies,
                <br />
                human approved.
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-emerald-100/75">
                Review customer context, refine grounded AI drafts, and approve
                the final response.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-emerald-100/70">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-amber-300">
                ✦
              </span>
              Drafts are never sent automatically
            </div>
          </div>
        </div>

        <form className="p-7 sm:p-10 md:p-12" onSubmit={submit}>
          <p className="eyebrow">Protected access</p>
          <h2 className="mt-2 text-3xl font-semibold text-emerald-950">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Sign in with the agent credentials configured for this demo.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block text-xs font-semibold text-stone-700">
              Email
              <input
                className="input mt-2"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-semibold text-stone-700">
              Password
              <input
                className="input mt-2"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter demo password"
                required
              />
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
          <button
            className="button-primary mt-6 w-full py-3"
            disabled={loading}
            type="submit"
          >
            {loading ? "Signing in…" : "Sign in to workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}

function DraftEditor({
  draft,
  onUpdated
}: {
  draft: Draft;
  onUpdated: () => Promise<void>;
}) {
  const [text, setText] = useState(draft.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setText(draft.content ?? ""), [draft.content]);

  async function approve() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await approveDraft(draft.id, text.trim());
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve reply");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError("");
    try {
      await retryDraft(draft.id);
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry draft");
    } finally {
      setBusy(false);
    }
  }

  if (draft.status === "used") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-700 text-[10px] text-white">
          ✓
        </span>
        Approved reply saved
      </div>
    );
  }

  if (draft.status === "generating") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
        <span className="flex-1">Gemini is drafting a grounded reply…</span>
        {draft.retryable && (
          <button className="font-bold underline" onClick={() => void retry()}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (draft.status === "failed") {
    return (
      <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-100 text-sm font-bold text-red-700">
            !
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-900">Draft unavailable</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700">
              {draft.error_message ?? "The AI provider could not generate a draft."}
            </p>
            <button
              className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
              onClick={() => void retry()}
              disabled={busy || !draft.retryable}
            >
              {busy ? "Retrying…" : "Retry draft"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-[#fffaf0] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-200 text-xs text-amber-950">
            ✦
          </span>
          <div>
            <p className="text-xs font-bold text-amber-950">AI suggested reply</p>
            <p className="text-[10px] text-amber-700">
              Attempt {draft.attempts} · {draft.model}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Review
        </span>
      </div>
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-amber-200 bg-white p-3 text-sm leading-relaxed text-stone-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={4000}
      />
      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[10px] text-stone-400">Edit freely before approval</p>
        <button
          className="button-primary px-5"
          disabled={busy || !text.trim()}
          onClick={() => void approve()}
        >
          {busy ? "Saving…" : "Approve reply"}
        </button>
      </div>
    </div>
  );
}

function ConversationMessage({
  message,
  onUpdated
}: {
  message: Message;
  onUpdated: () => Promise<void>;
}) {
  const fromCustomer = message.direction === "customer";
  return (
    <article className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
      <div className={`w-full max-w-2xl ${fromCustomer ? "pr-8" : "pl-8"}`}>
        <div className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
          <div
            className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
              fromCustomer
                ? "rounded-bl-md border border-stone-200 bg-white text-stone-800"
                : "rounded-br-md bg-emerald-800 text-white"
            }`}
          >
            <p>{message.text}</p>
            <p
              className={`mt-1.5 text-[10px] ${
                fromCustomer ? "text-stone-400" : "text-emerald-100"
              }`}
            >
              {fromCustomer ? "Customer" : "Approved by agent"} ·{" "}
              {formatTime(message.occurred_at)}
            </p>
          </div>
        </div>
        {message.draft && (
          <DraftEditor draft={message.draft} onUpdated={onUpdated} />
        )}
      </div>
    </article>
  );
}

export function AgentView() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [checking, setChecking] = useState(true);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(setAgent)
      .catch((cause) => {
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not check session");
        }
      })
      .finally(() => setChecking(false));
  }, []);

  async function refreshList(preferredId?: string | null) {
    setLoadingList(true);
    try {
      const items = await listConversations();
      setConversations(items);
      const next = preferredId ?? selectedId ?? items[0]?.id ?? null;
      if (next && items.some((item) => item.id === next)) setSelectedId(next);
      else setSelectedId(items[0]?.id ?? null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setAgent(null);
      else setError(cause instanceof Error ? cause.message : "Could not load inbox");
    } finally {
      setLoadingList(false);
    }
  }

  async function refreshConversation(id = selectedId) {
    if (!id) return;
    setLoadingConversation(true);
    setError("");
    try {
      setConversation(await getAgentConversation(id));
      await refreshList(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load conversation");
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    if (agent) void refreshList();
    // Refresh once when the authenticated agent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  useEffect(() => {
    if (agent && selectedId) void refreshConversation(selectedId);
    // selectedId is the complete navigation state for this inbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleLogout() {
    await logout();
    setAgent(null);
    setConversations([]);
    setConversation(null);
    setSelectedId(null);
  }

  if (checking) {
    return (
      <main className="grid min-h-[70vh] place-items-center text-sm text-stone-500">
        Checking secure session…
      </main>
    );
  }
  if (!agent) return <LoginPanel onLogin={setAgent} />;

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-5 lg:grid-cols-[350px_minmax(0,1fr)] lg:px-6 lg:py-7">
      <aside className="overflow-hidden rounded-[28px] border border-emerald-950/8 bg-white shadow-[0_20px_60px_rgba(28,55,43,0.08)]">
        <div className="border-b border-stone-100 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Agent inbox</p>
              <h2 className="mt-1 text-xl font-semibold text-emerald-950">
                Conversations
              </h2>
            </div>
            <button
              className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-500 transition hover:bg-stone-50"
              onClick={() => void handleLogout()}
            >
              Sign out
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-800 font-bold text-white">
              {initials(agent.display_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{agent.display_name}</span>
              <span className="block truncate text-[10px] text-emerald-700">
                {agent.email}
              </span>
            </span>
          </div>
        </div>

        <div className="max-h-[630px] overflow-y-auto p-2">
          {loadingList && conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-stone-400">Loading inbox…</p>
          ) : conversations.length ? (
            conversations.map((item) => (
              <button
                key={item.id}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  selectedId === item.id
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-transparent hover:bg-stone-50"
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      selectedId === item.id
                        ? "bg-emerald-800 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {initials(item.customer.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-stone-900">
                        {item.customer.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-stone-400">
                        {formatTime(item.latest_message_at, true)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-stone-500">
                      {item.latest_message}
                    </span>
                    {item.pending_drafts > 0 && (
                      <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        {item.pending_drafts} needs review
                      </span>
                    )}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-stone-700">Inbox is clear</p>
              <p className="mt-1 text-xs text-stone-400">
                Send a message from Customer view.
              </p>
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-h-[700px] flex-col overflow-hidden rounded-[28px] border border-emerald-950/8 bg-[#f7f4ec] shadow-[0_20px_60px_rgba(28,55,43,0.08)]">
        {conversation ? (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-emerald-950/8 bg-white/85 px-5 py-4 backdrop-blur sm:px-7">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-950">
                  {initials(conversation.customer.name)}
                </span>
                <div>
                  <h2 className="font-semibold text-emerald-950">
                    {conversation.customer.name}
                  </h2>
                  <p className="text-xs text-stone-500">
                    {conversation.customer.phone}
                  </p>
                </div>
              </div>
              <button
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
                onClick={() => void refreshConversation()}
              >
                Refresh
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
              {loadingConversation && (
                <p className="text-center text-xs text-stone-400">Refreshing…</p>
              )}
              {conversation.messages.map((message) => (
                <ConversationMessage
                  key={message.id}
                  message={message}
                  onUpdated={refreshConversation}
                />
              ))}
              {error && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="grid h-full flex-1 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-800">
                ↗
              </div>
              <h3 className="mt-4 text-lg font-semibold text-emerald-950">
                Select a conversation
              </h3>
              <p className="mt-2 text-sm text-stone-500">
                Review customer context and approve a grounded response.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

