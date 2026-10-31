import express, { Application, ErrorRequestHandler } from "express";
import cors from "cors";
import path from "node:path";
import { authMiddleware } from "./middleware/auth.js";
import { validateBooking } from "./middleware/validation/booking.js";
import {
  idempotentMiddleware,
  clearIdempotencyCache,
} from "./middleware/idempotenct.js";
import { rateLimitByEmail, clearRateLimits } from "./middleware/rateLimit.js";
import { validatePagination } from "./middleware/pagination.js";
import { createStore, HttpError } from "./store/index.js";
import { Slot } from "./type.js";

const app: Application = express();
const PORT = Number(process.env.PORT) || 8703;
const store = await createStore();

app.use(cors());

app.get("/health", (req, res) => {
  res.status(200).send("Up and Running");
});

// The assessment's contract, public like /health. /docs renders it with Swagger UI
// ("Authorize" takes the API key, then "Try it out" calls this server).
app.get("/openapi.json", (req, res) => {
  res.sendFile(path.join(process.cwd(), "openapi.json"));
});

app.get("/docs", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Clinic booking API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui" });</script>
</body>
</html>`);
});

app.use(authMiddleware);
app.use(express.json());

app.post("/reset", async (req, res) => {
  const slots = req.body?.slots;
  if (!Array.isArray(slots)) {
    return res.status(400).json({ error: "slots must be an array" });
  }

  await store.reset(
    slots.map(({ id, provider, start, end }: Slot) => ({
      id,
      provider,
      start,
      end,
    })),
  );
  clearRateLimits();
  clearIdempotencyCache();

  res.status(200).json({ ok: true });
});

app.get("/slots", async (req, res) => {
  const provider =
    typeof req.query.provider === "string" ? req.query.provider : undefined;

  res.json({ slots: await store.listSlots(provider) });
});

app.post(
  "/bookings",
  idempotentMiddleware,
  rateLimitByEmail,
  validateBooking,
  async (req, res) => {
    res.status(201).json(await store.createBooking(req.body));
  },
);

app.get("/bookings", validatePagination, async (req, res) => {
  const email = String(req.query.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const { cursor, limit } = res.locals.pagination;
  res.json(await store.listBookings(email, cursor, limit));
});

app.get("/bookings/:id", async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) {
    throw new HttpError(404, "booking not found");
  }

  res.json(booking);
});

app.delete("/bookings/:id", async (req, res) => {
  res.status(200).json(await store.cancelBooking(req.params.id));
});

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// HttpErrors from the store, malformed JSON, and anything unexpected all answer as {"error": ...}.
const onError: ErrorRequestHandler = (err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res
    .status(status)
    .json({ error: status < 500 ? err.message : "internal server error" });
};
app.use(onError);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
