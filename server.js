/**
 * Nexus Analytics API — Zero Dependencies
 * Node.js built-ins only: http, crypto, url
 * Run: node server.js
 */

const http   = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 4000;
const uuid = () => crypto.randomUUID();

// ─── DATA STORE ──────────────────────────────────────────────────────────────

let metrics = {
  revenue:    { label: "Total Revenue",    value: 50.3,  change: 1.5,  unit: "$", suffix: "k" },
  orders:     { label: "Total Orders",     value: 1284,  change: 8.2,  unit: "",  suffix: ""  },
  customers:  { label: "Active Customers", value: 3791,  change: -0.4, unit: "",  suffix: ""  },
  conversion: { label: "Conversion Rate",  value: 4.6,   change: 0.9,  unit: "",  suffix: "%" },
};

let revenueData = [
  { id: uuid(), month: "Jan", revenue: 32000, prev: 28000 },
  { id: uuid(), month: "Feb", revenue: 38000, prev: 31000 },
  { id: uuid(), month: "Mar", revenue: 35000, prev: 33000 },
  { id: uuid(), month: "Apr", revenue: 42000, prev: 35000 },
  { id: uuid(), month: "May", revenue: 46000, prev: 39000 },
  { id: uuid(), month: "Jun", revenue: 44000, prev: 41000 },
  { id: uuid(), month: "Jul", revenue: 50300, prev: 43000 },
];

let products = [
  { id: uuid(), name: "Wireless Pro", sales: 4200, category: "Audio"       },
  { id: uuid(), name: "SmartHub X",   sales: 3800, category: "Networking"  },
  { id: uuid(), name: "NovaPad",      sales: 3100, category: "Tablets"     },
  { id: uuid(), name: "FlexDesk",     sales: 2700, category: "Furniture"   },
  { id: uuid(), name: "AirClip",      sales: 2100, category: "Accessories" },
];

let transactions = [
  { id: "#TXN-8821", customer: "Amara Osei",    product: "Wireless Pro", amount: 249, status: "Completed", date: "2026-02-21" },
  { id: "#TXN-8820", customer: "Lena Fischer",  product: "SmartHub X",   amount: 189, status: "Pending",   date: "2026-02-21" },
  { id: "#TXN-8819", customer: "Carlos Rivera", product: "NovaPad",      amount: 399, status: "Completed", date: "2026-02-20" },
  { id: "#TXN-8818", customer: "Yuki Tanaka",   product: "FlexDesk",     amount: 529, status: "Failed",    date: "2026-02-20" },
  { id: "#TXN-8817", customer: "Priya Nair",    product: "AirClip",      amount:  79, status: "Completed", date: "2026-02-19" },
  { id: "#TXN-8816", customer: "Marcus Webb",   product: "Wireless Pro", amount: 249, status: "Completed", date: "2026-02-19" },
];

let txnCounter = 8822;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function send(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    "Content-Type":  "application/json",
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

const ok   = (res, data, code = 200) => send(res, code, { ok: true,  data });
const fail = (res, msg,  code = 400) => send(res, code, { ok: false, error: msg });

function recalcMetrics() {
  const total = revenueData.reduce((s, r) => s + r.revenue, 0);
  const prev  = revenueData.reduce((s, r) => s + r.prev,    0);
  metrics.revenue.value  = +(total / 1000).toFixed(1);
  metrics.revenue.change = prev > 0 ? +((total - prev) / prev * 100).toFixed(1) : 0;
  metrics.orders.value   = transactions.filter(t => t.status !== "Failed").length;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

async function router(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const base = new URL(req.url, `http://localhost:${PORT}`);
  const path = base.pathname.replace(/\/$/, "");
  const q    = base.searchParams;
  const method = req.method.toUpperCase();

  let body = {};
  if (["POST", "PUT", "PATCH"].includes(method)) {
    try { body = await readBody(req); }
    catch { return fail(res, "Invalid JSON body"); }
  }

  // ── GET /api/health ──────────────────────────────────────────────────────
  if (method === "GET" && path === "/api/health") {
    return ok(res, {
      status: "ok", uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      counts: { revenueMonths: revenueData.length, products: products.length, transactions: transactions.length },
    });
  }

  // ── METRICS ──────────────────────────────────────────────────────────────
  if (path === "/api/metrics") {
    if (method === "GET") { recalcMetrics(); return ok(res, metrics); }
  }

  const metricsMatch = path.match(/^\/api\/metrics\/(\w+)$/);
  if (metricsMatch) {
    const key = metricsMatch[1];
    if (method === "PUT") {
      if (!metrics[key]) return fail(res, `Unknown metric "${key}"`, 404);
      if (body.value  !== undefined) metrics[key].value  = Number(body.value);
      if (body.change !== undefined) metrics[key].change = Number(body.change);
      return ok(res, metrics[key]);
    }
  }

  // ── REVENUE ──────────────────────────────────────────────────────────────
  if (path === "/api/revenue") {
    if (method === "GET")  return ok(res, revenueData);
    if (method === "POST") {
      const { month, revenue, prev = 0 } = body;
      if (!month || revenue === undefined) return fail(res, "month and revenue required");
      if (revenueData.find(r => r.month === month)) return fail(res, `Month "${month}" already exists`);
      const entry = { id: uuid(), month, revenue: Number(revenue), prev: Number(prev) };
      revenueData.push(entry);
      return ok(res, entry, 201);
    }
  }

  const revMatch = path.match(/^\/api\/revenue\/(.+)$/);
  if (revMatch) {
    const month = decodeURIComponent(revMatch[1]);
    const entry = revenueData.find(r => r.month === month);
    if (method === "PUT") {
      if (!entry) return fail(res, "Month not found", 404);
      if (body.revenue !== undefined) entry.revenue = Number(body.revenue);
      if (body.prev    !== undefined) entry.prev    = Number(body.prev);
      return ok(res, entry);
    }
    if (method === "DELETE") {
      const idx = revenueData.findIndex(r => r.month === month);
      if (idx === -1) return fail(res, "Month not found", 404);
      return ok(res, revenueData.splice(idx, 1)[0]);
    }
  }

  // ── PRODUCTS ─────────────────────────────────────────────────────────────
  if (path === "/api/products") {
    if (method === "GET")  return ok(res, [...products].sort((a, b) => b.sales - a.sales));
    if (method === "POST") {
      const { name, sales, category = "General" } = body;
      if (!name || sales === undefined) return fail(res, "name and sales required");
      const p = { id: uuid(), name, sales: Number(sales), category };
      products.push(p);
      return ok(res, p, 201);
    }
  }

  const prodMatch = path.match(/^\/api\/products\/(.+)$/);
  if (prodMatch) {
    const id = decodeURIComponent(prodMatch[1]);
    const p  = products.find(x => x.id === id);
    if (method === "PUT") {
      if (!p) return fail(res, "Product not found", 404);
      if (body.name     !== undefined) p.name     = body.name;
      if (body.sales    !== undefined) p.sales    = Number(body.sales);
      if (body.category !== undefined) p.category = body.category;
      return ok(res, p);
    }
    if (method === "DELETE") {
      const idx = products.findIndex(x => x.id === id);
      if (idx === -1) return fail(res, "Product not found", 404);
      return ok(res, products.splice(idx, 1)[0]);
    }
  }

  // ── TRANSACTIONS ─────────────────────────────────────────────────────────
  if (path === "/api/transactions") {
    if (method === "GET") {
      let result = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
      if (q.get("status")) result = result.filter(t => t.status === q.get("status"));
      if (q.get("search")) {
        const s = q.get("search").toLowerCase();
        result = result.filter(t =>
          t.customer.toLowerCase().includes(s) ||
          t.product.toLowerCase().includes(s)  ||
          t.id.toLowerCase().includes(s)
        );
      }
      if (q.get("limit")) result = result.slice(0, Number(q.get("limit")));
      return ok(res, result);
    }
    if (method === "POST") {
      const { customer, product, amount, status = "Pending", date } = body;
      if (!customer || !product || amount === undefined)
        return fail(res, "customer, product, and amount required");
      const valid = ["Completed", "Pending", "Failed"];
      const txn = {
        id:       `#TXN-${txnCounter++}`,
        customer, product,
        amount:   parseFloat(amount),
        status:   valid.includes(status) ? status : "Pending",
        date:     date || new Date().toISOString().split("T")[0],
      };
      transactions.unshift(txn);
      if (txn.status === "Completed") {
        metrics.revenue.value = +(metrics.revenue.value + txn.amount / 1000).toFixed(2);
        metrics.orders.value += 1;
      }
      return ok(res, txn, 201);
    }
  }

  const txnMatch = path.match(/^\/api\/transactions\/(.+)$/);
  if (txnMatch) {
    const id  = decodeURIComponent(txnMatch[1]);
    const txn = transactions.find(t => t.id === id);
    if (method === "PUT") {
      if (!txn) return fail(res, "Transaction not found", 404);
      ["customer","product","status","date"].forEach(f => { if (body[f] !== undefined) txn[f] = body[f]; });
      if (body.amount !== undefined) txn.amount = parseFloat(body.amount);
      return ok(res, txn);
    }
    if (method === "DELETE") {
      const idx = transactions.findIndex(t => t.id === id);
      if (idx === -1) return fail(res, "Transaction not found", 404);
      return ok(res, transactions.splice(idx, 1)[0]);
    }
  }

  fail(res, `${method} ${path} not found`, 404);
}

// ─── START ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  router(req, res).catch(err => {
    console.error("Unhandled error:", err);
    send(res, 500, { ok: false, error: "Internal server error" });
  });
});

server.listen(PORT, () => {
  console.log("\n🚀  Nexus Analytics API");
  console.log(`    http://localhost:${PORT}/api`);
  console.log(`    Health: http://localhost:${PORT}/api/health`);
  console.log("\n  No dependencies — pure Node.js built-ins only.\n");
  console.log("  Routes ready:");
  console.log("    GET  /api/metrics            PUT  /api/metrics/:key");
  console.log("    GET|POST /api/revenue        PUT|DELETE /api/revenue/:month");
  console.log("    GET|POST /api/products       PUT|DELETE /api/products/:id");
  console.log("    GET|POST /api/transactions   PUT|DELETE /api/transactions/:id");
  console.log("    GET  /api/health\n");
});
