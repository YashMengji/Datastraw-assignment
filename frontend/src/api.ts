import type {
  Agent,
  AgentConversation,
  ConversationListItem,
  CustomerConversation,
  DemoCustomer,
  Draft,
  Message
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include"
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (typeof payload.detail === "string") message = payload.detail;
    } catch {
      // Keep the status-based fallback for non-JSON responses.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getCustomerConversation(id: string) {
  return request<CustomerConversation>(
    `/api/customer/conversations/${encodeURIComponent(id)}`
  );
}

export function sendCustomerMessage(customer: DemoCustomer, text: string) {
  return request<{ draft_status: string }>("/api/customer/messages", {
    method: "POST",
    body: JSON.stringify({
      customer,
      text
    })
  });
}

export function login(email: string, password: string) {
  return request<Agent>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function getMe() {
  return request<Agent>("/api/auth/me");
}

export function listConversations() {
  return request<ConversationListItem[]>("/api/agent/conversations");
}

export function getAgentConversation(id: string) {
  return request<AgentConversation>(`/api/agent/conversations/${id}`);
}

export function approveDraft(id: string, text: string) {
  return request<Message>(`/api/agent/drafts/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function retryDraft(id: string) {
  return request<Draft>(`/api/agent/drafts/${id}/retry`, {
    method: "POST"
  });
}

