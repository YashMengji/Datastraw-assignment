const fs = require("node:fs");
const path = require("node:path");
const {
  createCanvas,
  GlobalFonts,
  Path2D,
} = require("C:/Users/Acer/AppData/Local/Temp/codex-pdf-read/node_modules/@napi-rs/canvas");

const width = 2200;
const height = 1600;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

const palette = {
  background: "#F5F7F2",
  card: "#FFFFFF",
  ink: "#18352B",
  muted: "#65736C",
  border: "#CBD7D0",
  header: "#154F3D",
  headerText: "#FFFFFF",
  key: "#E5F4EA",
  keyText: "#17603F",
  relation: "#477060",
  logical: "#B36A22",
  note: "#FFF2D9",
};

ctx.fillStyle = palette.background;
ctx.fillRect(0, 0, width, height);

ctx.fillStyle = palette.ink;
ctx.font = "600 48px Segoe UI";
ctx.fillText("Verdant Support — Database ER Diagram", 80, 78);
ctx.fillStyle = palette.muted;
ctx.font = "24px Segoe UI";
ctx.fillText(
  "Current PostgreSQL schema implemented by SQLAlchemy and Alembic",
  82,
  118,
);

function roundedRect(x, y, w, h, radius = 22) {
  const p = new Path2D();
  p.roundRect(x, y, w, h, radius);
  return p;
}

function drawTable(table) {
  const { x, y, w, title, fields, accent = palette.header } = table;
  const headerH = 62;
  const rowH = 37;
  const h = headerH + fields.length * rowH + 18;
  table.h = h;

  ctx.shadowColor = "rgba(24, 53, 43, 0.10)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = palette.card;
  ctx.fill(roundedRect(x, y, w, h));
  ctx.shadowColor = "transparent";

  ctx.save();
  ctx.clip(roundedRect(x, y, w, h));
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, headerH);
  ctx.restore();

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.stroke(roundedRect(x, y, w, h));

  ctx.fillStyle = palette.headerText;
  ctx.font = "600 25px Segoe UI";
  ctx.fillText(title, x + 24, y + 39);

  fields.forEach((field, index) => {
    const rowY = y + headerH + index * rowH;
    if (index > 0) {
      ctx.strokeStyle = "#E8EEEA";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 20, rowY);
      ctx.lineTo(x + w - 20, rowY);
      ctx.stroke();
    }

    if (field.key) {
      ctx.fillStyle = palette.key;
      ctx.fill(roundedRect(x + 18, rowY + 7, 54, 24, 9));
      ctx.fillStyle = palette.keyText;
      ctx.font = "600 14px Segoe UI";
      ctx.fillText(field.key, x + 29, rowY + 24);
    }

    ctx.fillStyle = palette.ink;
    ctx.font = "500 18px Consolas";
    ctx.fillText(field.name, x + 84, rowY + 25);
    ctx.fillStyle = palette.muted;
    ctx.font = "16px Segoe UI";
    const typeWidth = ctx.measureText(field.type).width;
    ctx.fillText(field.type, x + w - 22 - typeWidth, rowY + 25);
  });

  return table;
}

function anchor(table, side, offset = 0.5) {
  if (side === "left") return [table.x, table.y + table.h * offset];
  if (side === "right") return [table.x + table.w, table.y + table.h * offset];
  if (side === "top") return [table.x + table.w * offset, table.y];
  return [table.x + table.w * offset, table.y + table.h];
}

function drawEndpoint(x, y, label, side) {
  ctx.fillStyle = palette.background;
  ctx.strokeStyle = palette.relation;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "600 17px Segoe UI";
  const metrics = ctx.measureText(label);
  let tx = x - metrics.width / 2;
  let ty = y - 16;
  if (side === "left") {
    tx = x - metrics.width - 14;
    ty = y - 12;
  } else if (side === "right") {
    tx = x + 14;
    ty = y - 12;
  } else if (side === "top") {
    ty = y - 14;
  } else if (side === "bottom") {
    ty = y + 29;
  }
  ctx.fillText(label, tx, ty);
}

function relationship({
  from,
  fromSide,
  fromOffset = 0.5,
  to,
  toSide,
  toOffset = 0.5,
  fromCard,
  toCard,
  label,
  via,
  dashed = false,
  color = palette.relation,
}) {
  const start = anchor(from, fromSide, fromOffset);
  const end = anchor(to, toSide, toOffset);
  const points = [start, ...(via || []), end];

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  if (dashed) ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();
  ctx.restore();

  drawEndpoint(start[0], start[1], fromCard, fromSide);
  drawEndpoint(end[0], end[1], toCard, toSide);

  const middleSegment = Math.floor((points.length - 1) / 2);
  const middle = [
    (points[middleSegment][0] + points[middleSegment + 1][0]) / 2,
    (points[middleSegment][1] + points[middleSegment + 1][1]) / 2,
  ];
  ctx.font = "500 18px Segoe UI";
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = palette.background;
  ctx.fillRect(middle[0] - textWidth / 2 - 10, middle[1] - 28, textWidth + 20, 29);
  ctx.fillStyle = color;
  ctx.fillText(label, middle[0] - textWidth / 2, middle[1] - 8);
}

const agents = drawTable({
  x: 80,
  y: 180,
  w: 430,
  title: "agents",
  fields: [
    { key: "PK", name: "id", type: "uuid" },
    { key: "UK", name: "email", type: "varchar(320)" },
    { name: "password_hash", type: "varchar(255)" },
    { name: "display_name", type: "varchar(120)" },
    { name: "is_active", type: "boolean" },
    { name: "created_at", type: "timestamptz" },
  ],
});

const customers = drawTable({
  x: 80,
  y: 650,
  w: 430,
  title: "customers",
  fields: [
    { key: "PK", name: "id", type: "uuid" },
    { key: "UQ*", name: "brand_id", type: "varchar(80)" },
    { key: "UQ*", name: "external_id", type: "varchar(120)" },
    { name: "name", type: "varchar(120)" },
    { name: "phone", type: "varchar(32)" },
    { name: "created_at", type: "timestamptz" },
    { name: "updated_at", type: "timestamptz" },
  ],
});

const conversations = drawTable({
  x: 660,
  y: 610,
  w: 430,
  title: "conversations",
  fields: [
    { key: "PK", name: "id", type: "uuid" },
    { key: "FK", name: "customer_id", type: "uuid + unique" },
    { name: "status", type: "varchar(20)" },
    { name: "created_at", type: "timestamptz" },
    { name: "updated_at", type: "timestamptz" },
  ],
});

const messages = drawTable({
  x: 1240,
  y: 305,
  w: 530,
  title: "messages",
  fields: [
    { key: "PK", name: "id", type: "uuid" },
    { key: "FK", name: "conversation_id", type: "uuid" },
    { key: "UK", name: "external_message_id", type: "varchar(120)?" },
    { name: "direction", type: "varchar(20)" },
    { name: "text", type: "text" },
    { name: "occurred_at", type: "timestamptz" },
    { name: "created_at", type: "timestamptz" },
    { key: "FK", name: "in_reply_to_message_id", type: "uuid?" },
    { key: "UK", name: "approved_from_draft_id", type: "uuid?" },
  ],
});

const webhookEvents = drawTable({
  x: 610,
  y: 1130,
  w: 500,
  title: "webhook_events",
  fields: [
    { key: "PK", name: "event_id", type: "varchar(120)" },
    { name: "brand_id", type: "varchar(80)" },
    { name: "payload", type: "json" },
    { key: "FK", name: "message_id", type: "uuid?" },
    { name: "received_at", type: "timestamptz" },
  ],
});

const drafts = drawTable({
  x: 1570,
  y: 980,
  w: 550,
  title: "drafts",
  fields: [
    { key: "PK", name: "id", type: "uuid" },
    { key: "FK", name: "source_message_id", type: "uuid + unique" },
    { name: "content", type: "text?" },
    { name: "status", type: "varchar(20)" },
    { name: "error_code", type: "varchar(80)?" },
    { name: "error_message", type: "varchar(300)?" },
    { name: "attempts", type: "integer" },
    { name: "model", type: "varchar(120)" },
    { name: "attempt_started_at", type: "timestamptz" },
    { name: "created_at", type: "timestamptz" },
    { name: "updated_at", type: "timestamptz" },
    { name: "used_at", type: "timestamptz?" },
  ],
});

relationship({
  from: customers,
  fromSide: "right",
  to: conversations,
  toSide: "left",
  fromCard: "1",
  toCard: "0..1",
  label: "has open conversation",
});

relationship({
  from: conversations,
  fromSide: "right",
  to: messages,
  toSide: "left",
  fromCard: "1",
  toCard: "many",
  label: "contains",
  via: [[1165, 780], [1165, 610]],
});

relationship({
  from: messages,
  fromSide: "bottom",
  fromOffset: 0.72,
  to: drafts,
  toSide: "top",
  toOffset: 0.55,
  fromCard: "1",
  toCard: "0..1",
  label: "AI draft for",
  via: [[1505, 930], [1845, 930]],
});

relationship({
  from: webhookEvents,
  fromSide: "right",
  to: messages,
  toSide: "bottom",
  toOffset: 0.2,
  fromCard: "many",
  toCard: "0..1",
  label: "records message",
  via: [[1190, 1270], [1190, 900], [1370, 900]],
});

relationship({
  from: messages,
  fromSide: "right",
  fromOffset: 0.28,
  to: messages,
  toSide: "right",
  toOffset: 0.76,
  fromCard: "1",
  toCard: "0..many",
  label: "reply chain",
  via: [[1885, 520], [1885, 820], [1770, 820]],
});

// Logical application reference: approved_from_draft_id is unique but is not a DB FK.
relationship({
  from: messages,
  fromSide: "bottom",
  fromOffset: 0.42,
  to: drafts,
  toSide: "left",
  toOffset: 0.55,
  fromCard: "0..1",
  toCard: "1",
  label: "approved from (logical)",
  via: [[1430, 900], [1430, 1260]],
  dashed: true,
  color: palette.logical,
});

// Notes and legend.
ctx.fillStyle = palette.note;
ctx.fill(roundedRect(80, 1160, 430, 210, 18));
ctx.strokeStyle = "#E5C68D";
ctx.lineWidth = 2;
ctx.stroke(roundedRect(80, 1160, 430, 210, 18));
ctx.fillStyle = palette.ink;
ctx.font = "600 20px Segoe UI";
ctx.fillText("MVP schema notes", 104, 1197);
ctx.font = "17px Segoe UI";
ctx.fillStyle = palette.muted;
ctx.fillText("• agents is currently auth-only", 104, 1232);
ctx.fillText("• UQ*: brand_id + external_id", 104, 1264);
ctx.fillText("• dashed line = logical reference", 104, 1296);
ctx.fillText("• brand_id is not a brands FK yet", 104, 1328);

ctx.fillStyle = palette.muted;
ctx.font = "16px Segoe UI";
ctx.fillText("PK  primary key     FK  foreign key     UK  unique     UQ*  composite unique     ?  nullable", 80, 1538);

const output = path.resolve(__dirname, "..", "docs", "database-er-diagram.png");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, canvas.toBuffer("image/png"));
console.log(output);
