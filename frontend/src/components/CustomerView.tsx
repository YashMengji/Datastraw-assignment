import { useEffect, useMemo, useState } from "react";
import {
  getCustomerConversation,
  sendCustomerMessage
} from "../api";
import type { CustomerConversation, DemoCustomer } from "../types";

const PRESETS: DemoCustomer[] = [
  { id: "cust_1042", name: "Aisha Khan", phone: "+919800000001" },
  { id: "cust_2048", name: "Rohan Mehta", phone: "+919800000002" },
  { id: "cust_3096", name: "Maya Iyer", phone: "+919800000003" }
];

const SAMPLES = [
  "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?",
  "What is your return policy?",
  "Do you deliver to Dubai?",
  "Is cash on delivery available for a ₹3,500 order?",
  "I think I'm allergic to the serum I bought. What should I do?"
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short"
  }).format(new Date(value));
}

function loadCustomCustomer(): DemoCustomer | null {
  try {
    const value = localStorage.getItem("verdant_custom_customer");
    return value ? (JSON.parse(value) as DemoCustomer) : null;
  } catch {
    return null;
  }
}

export function CustomerView() {
  const [customCustomer, setCustomCustomer] = useState<DemoCustomer | null>(
    loadCustomCustomer
  );
  const profiles = useMemo(
    () => (customCustomer ? [...PRESETS, customCustomer] : PRESETS),
    [customCustomer]
  );
  const [selectedId, setSelectedId] = useState(PRESETS[0].id);
  const [conversation, setConversation] =
    useState<CustomerConversation | null>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState(customCustomer?.name ?? "");
  const [customPhone, setCustomPhone] = useState(customCustomer?.phone ?? "");

  const selected =
    profiles.find((profile) => profile.id === selectedId) ?? profiles[0];

  async function refresh(customerId = selected.id) {
    setIsLoading(true);
    setError("");
    try {
      setConversation(await getCustomerConversation(customerId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load messages");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh(selected.id);
    // selected.id is the complete profile identity for this demo tool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);

  async function handleSend() {
    const text = message.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setError("");
    try {
      await sendCustomerMessage(selected, text);
      setMessage("");
      await refresh(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message could not be sent");
    } finally {
      setIsSending(false);
    }
  }

  function saveCustomCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!customName.trim() || !customPhone.trim()) return;
    const profile: DemoCustomer = {
      id: customCustomer?.id ?? `demo_${crypto.randomUUID()}`,
      name: customName.trim(),
      phone: customPhone.trim()
    };
    localStorage.setItem("verdant_custom_customer", JSON.stringify(profile));
    setCustomCustomer(profile);
    setSelectedId(profile.id);
    setShowCustom(false);
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-5 lg:grid-cols-[330px_minmax(0,1fr)] lg:px-6 lg:py-7">
      <aside className="rounded-[28px] border border-emerald-950/8 bg-white p-5 shadow-[0_20px_60px_rgba(28,55,43,0.08)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Test customer</p>
            <h2 className="mt-1 text-xl font-semibold text-emerald-950">
              Choose a profile
            </h2>
          </div>
          <button
            className="rounded-full border border-emerald-900/10 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-50"
            onClick={() => setShowCustom((value) => !value)}
          >
            {showCustom ? "Close" : "+ Custom"}
          </button>
        </div>

        {showCustom && (
          <form
            className="mb-4 space-y-3 rounded-2xl bg-emerald-50/70 p-4"
            onSubmit={saveCustomCustomer}
          >
            <label className="block text-xs font-semibold text-emerald-950">
              Name
              <input
                className="input mt-1.5"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="Priya Sharma"
                maxLength={120}
              />
            </label>
            <label className="block text-xs font-semibold text-emerald-950">
              Phone
              <input
                className="input mt-1.5"
                value={customPhone}
                onChange={(event) => setCustomPhone(event.target.value)}
                placeholder="+919800000004"
                maxLength={32}
              />
            </label>
            <button className="button-primary w-full" type="submit">
              Use this customer
            </button>
          </form>
        )}

        <div className="space-y-2">
          {profiles.map((profile) => {
            const active = profile.id === selected.id;
            return (
              <button
                key={profile.id}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                  active
                    ? "border-emerald-700 bg-emerald-50 shadow-sm"
                    : "border-transparent hover:border-emerald-900/10 hover:bg-stone-50"
                }`}
                onClick={() => setSelectedId(profile.id)}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    active
                      ? "bg-emerald-800 text-white"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {profile.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-stone-900">
                    {profile.name}
                  </span>
                  <span className="block truncate text-xs text-stone-500">
                    {profile.phone}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-stone-100 pt-5">
          <p className="eyebrow">Try a sample</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SAMPLES.map((sample, index) => (
              <button
                key={sample}
                className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-amber-100 hover:text-amber-950"
                onClick={() => setMessage(sample)}
                title={sample}
              >
                Sample {index + 1}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-[650px] flex-col overflow-hidden rounded-[28px] border border-emerald-950/8 bg-[#f7f4ec] shadow-[0_20px_60px_rgba(28,55,43,0.08)]">
        <header className="flex items-center gap-3 border-b border-emerald-950/8 bg-white/80 px-5 py-4 backdrop-blur sm:px-7">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-100 font-bold text-amber-950">
            {selected.name[0]}
          </span>
          <div>
            <h2 className="font-semibold text-emerald-950">{selected.name}</h2>
            <p className="text-xs text-stone-500">
              Customer view · drafts stay private
            </p>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
          {isLoading ? (
            <div className="grid h-full place-items-center text-sm text-stone-500">
              Loading conversation…
            </div>
          ) : conversation?.messages.length ? (
            conversation.messages.map((item) => (
              <div
                className={`flex ${
                  item.direction === "customer" ? "justify-end" : "justify-start"
                }`}
                key={item.id}
              >
                <div
                  className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[68%] ${
                    item.direction === "customer"
                      ? "rounded-br-md bg-emerald-800 text-white"
                      : "rounded-bl-md border border-emerald-950/8 bg-white text-stone-800"
                  }`}
                >
                  <p>{item.text}</p>
                  <p
                    className={`mt-1.5 text-[10px] ${
                      item.direction === "customer"
                        ? "text-emerald-100"
                        : "text-stone-400"
                    }`}
                  >
                    {formatTime(item.occurred_at)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl">
                  ✦
                </div>
                <h3 className="mt-4 text-lg font-semibold text-emerald-950">
                  Start a conversation
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  Send a support question. The AI draft will be visible only to
                  a signed-in agent.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-emerald-950/8 bg-white p-4 sm:p-5">
          {error && (
            <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-end gap-3">
            <textarea
              className="min-h-12 flex-1 resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              rows={2}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type a message…"
              maxLength={4000}
            />
            <button
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-800 text-lg text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleSend()}
              disabled={!message.trim() || isSending}
              aria-label="Send message"
            >
              {isSending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                "↑"
              )}
            </button>
          </div>
          <p className="mt-2 px-1 text-[10px] text-stone-400">
            Enter to send · Shift + Enter for a new line
          </p>
        </div>
      </section>
    </main>
  );
}

