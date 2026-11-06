import { createHmac, randomUUID } from "node:crypto";

const baseUrl = (process.argv[2] ?? "http://localhost:8000").replace(/\/$/, "");
const secret = process.env.WEBHOOK_SECRET ?? "verdant-demo-secret-2026";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

const payload = {
  event_id: `evt_${suffix}`,
  type: "message.received",
  brand_id: "verdant-co",
  timestamp: new Date().toISOString(),
  customer: {
    id: "cust_1042",
    name: "Aisha Khan",
    phone: "+919800000001"
  },
  message: {
    id: `msg_${suffix}`,
    type: "text",
    text: "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?"
  }
};

const body = JSON.stringify(payload);
const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const response = await fetch(`${baseUrl}/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Signature": signature
  },
  body
});

console.log(response.status, await response.text());
if (!response.ok) process.exitCode = 1;

