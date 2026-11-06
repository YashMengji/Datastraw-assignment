export type ViewMode = "customer" | "agent";

export interface Customer {
  id: string;
  external_id: string;
  name: string;
  phone: string;
}

export interface Draft {
  id: string;
  content: string | null;
  status: "generating" | "ready" | "failed" | "used";
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  model: string;
  attempt_started_at: string;
  updated_at: string;
  retryable: boolean;
}

export interface Message {
  id: string;
  direction: "customer" | "agent";
  text: string;
  occurred_at: string;
  draft: Draft | null;
}

export interface CustomerConversation {
  customer: Customer;
  conversation_id: string | null;
  messages: Message[];
}

export interface ConversationListItem {
  id: string;
  customer: Customer;
  latest_message: string;
  latest_message_at: string;
  pending_drafts: number;
}

export interface AgentConversation {
  id: string;
  customer: Customer;
  messages: Message[];
}

export interface Agent {
  id: string;
  email: string;
  display_name: string;
}

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
}

