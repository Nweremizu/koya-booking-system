// Smoke test for every level. Usage: BASE_URL=https://... API_KEY=... node check.mjs
// WARNING: calls /reset, which wipes all bookings on the target.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:8703";
const KEY = process.env.API_KEY;

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": KEY, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
};
const book = (slot_id, email, headers) => call("POST", "/bookings", { slot_id, name: " Ada Obi ", email }, headers);

const slots = [
  { id: "s2", provider: "Dr Ade", start: "2099-01-01T10:00:00Z", end: "2099-01-01T10:30:00Z" },
  { id: "s1", provider: "Dr Ade", start: "2099-01-01T09:00:00Z", end: "2099-01-01T09:30:00Z" },
  { id: "s3", provider: "Dr Bello", start: "2099-01-01T09:00:00Z", end: "2099-01-01T09:30:00Z" },
  { id: "past", provider: "Dr Bello", start: "2000-01-01T09:00:00Z", end: "2000-01-01T09:30:00Z" },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, provider: "Dr Race", start: `2099-02-0${i % 9 + 1}T09:00:00Z`, end: `2099-02-0${i % 9 + 1}T09:30:00Z` })),
];

// Level 1
assert.equal((await call("POST", "/reset", { slots })).status, 200);
let r = await call("GET", "/slots");
assert.equal(r.status, 200);
assert.equal(r.body.slots[0].start, "2000-01-01T09:00:00Z", "earliest first");
assert.ok(r.body.slots.every((s) => s.available === true));
r = await call("GET", "/slots?provider=Dr%20Bello");
assert.deepEqual(r.body.slots.map((s) => s.id), ["past", "s3"]);
r = await book("s1", " ADA@Example.com ");
assert.equal(r.status, 201);
assert.equal(r.body.status, "confirmed");
assert.equal(r.body.name, "Ada Obi");
assert.equal(r.body.email, "ada@example.com");
const first = r.body;
r = await call("GET", `/bookings/${first.id}`);
assert.deepEqual(r.body, first);
assert.equal((await call("GET", "/bookings/nope")).status, 404);
r = await call("GET", "/slots");
assert.equal(r.body.slots.find((s) => s.id === "s1").available, false);
console.log("level 1 ok");

// Level 2
assert.equal((await call("GET", "/slots", undefined, { "X-API-Key": "" })).status, 401);
assert.equal((await call("GET", "/slots", undefined, { "X-API-Key": "wrong" })).status, 401);
assert.equal((await call("POST", "/bookings", { slot_id: "s2", name: "A" })).status, 400);
assert.equal((await call("POST", "/bookings", { slot_id: "s2", name: "  ", email: "b@x.com" })).status, 400);
assert.equal((await call("POST", "/bookings", { slot_id: "s2", name: "A", email: "nope" })).status, 400);
assert.equal((await book("missing", "c@x.com")).status, 404);
assert.equal((await book("past", "d@x.com")).status, 400);
r = await fetch(BASE + "/bookings", { method: "POST", headers: { "X-API-Key": KEY, "Content-Type": "application/json" }, body: "{bad" });
assert.equal(r.status, 400);
assert.ok((await r.json()).error);
console.log("level 2 ok");

// Level 3
assert.equal((await book("s1", "e@x.com")).status, 409);
const race = await Promise.all(Array.from({ length: 20 }, (_, i) => book("s3", `race${i}@x.com`)));
assert.equal(race.filter((x) => x.status === 201).length, 1, "exactly one winner");
assert.equal(race.filter((x) => x.status === 409).length, 19);
r = await call("DELETE", `/bookings/${first.id}`);
assert.equal(r.status, 200);
assert.equal(r.body.status, "cancelled");
assert.equal((await call("DELETE", `/bookings/${first.id}`)).status, 409);
assert.equal((await call("DELETE", "/bookings/nope")).status, 404);
assert.equal((await call("GET", `/bookings/${first.id}`)).body.status, "cancelled");
assert.equal((await book("s1", "f@x.com")).status, 201, "slot freed after cancel");
console.log("level 3 ok");

// Level 4
const idem = { "Idempotency-Key": "k-" + Date.now() };
const a = await book("s2", "g@x.com", idem);
const b = await book("s2", "g@x.com", idem);
assert.equal(a.status, 201);
assert.equal(b.status, 201);
assert.equal(a.body.id, b.body.id);
assert.equal((await book("s2", "h@x.com", idem)).status, 422);
const concKey = { "Idempotency-Key": "conc-" + Date.now() };
const conc = await Promise.all(Array.from({ length: 5 }, () => book("r9", "i@x.com", concKey)));
assert.ok(conc.every((x) => x.status === 201));
assert.equal(new Set(conc.map((x) => x.body.id)).size, 1, "concurrent retries share one booking");
for (const id of ["r0", "r1", "r2"]) await book(id, "Page@X.com");
r = await call("GET", "/bookings?email=PAGE@x.com&limit=2");
assert.equal(r.body.bookings.length, 2);
assert.ok(r.body.next_cursor);
const r2 = await call("GET", `/bookings?email=page@x.com&limit=2&cursor=${r.body.next_cursor}`);
assert.equal(r2.body.bookings.length, 1);
assert.equal(r2.body.next_cursor, null);
assert.deepEqual([...r.body.bookings, ...r2.body.bookings].map((x) => x.slot_id), ["r0", "r1", "r2"], "oldest first");
r = await call("GET", "/bookings?email=nobody@x.com");
assert.deepEqual(r.body, { bookings: [], next_cursor: null });
for (const limit of ["0", "51", "abc", "1.5"]) assert.equal((await call("GET", `/bookings?email=a@x.com&limit=${limit}`)).status, 400, `limit=${limit}`);
console.log("level 4 ok");

// Level 5
const spam = [];
for (let i = 0; i < 6; i++) spam.push(await call("POST", "/bookings", { slot_id: "missing", name: "S", email: "spam@x.com" }));
assert.deepEqual(spam.map((x) => x.status), [404, 404, 404, 404, 404, 429]);
assert.match(spam[5].headers.get("retry-after"), /^\d+$/);
assert.equal((await book("r5", "other@x.com")).status, 201, "other emails unaffected");
console.log("level 5 ok");

await call("POST", "/reset", { slots: slots.filter((s) => !s.id.startsWith("r")) });
console.log("all checks passed");
