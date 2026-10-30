import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { randomUUID } from "crypto";
import { Booking, DbJson } from "../type.js";
import { sortBy } from "../utils.js";
import { HttpError, Store, hasStarted } from "./index.js";

// ponytail: the whole DB lives in memory and the file is a write-through copy for restarts.
// Single process only, and Render's free disk is wiped on redeploy; use the Postgres store in production.
export function createJsonStore(file: string): Store {
  const db: DbJson = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { slots: [], bookings: [] };

  // Serialize file writes so concurrent saves never interleave.
  let saving = Promise.resolve();
  const save = () =>
    (saving = saving
      .catch(() => {})
      .then(() => fs.writeFile(file, JSON.stringify(db, null, 2), "utf8")));

  const isAvailable = (slotId: string) =>
    !db.bookings.some((b) => b.slot_id === slotId && b.status === "confirmed");

  return {
    async reset(slots) {
      db.slots = slots;
      db.bookings = [];
      await save();
    },

    async listSlots(provider) {
      const slots = provider
        ? db.slots.filter((s) => s.provider === provider)
        : db.slots;
      return sortBy(slots, "start", "asc", "date").map((s) => ({
        ...s,
        available: isAvailable(s.id),
      }));
    },

    async createBooking({ slot_id, name, email }) {
      const slot = db.slots.find((s) => s.id === slot_id);
      if (!slot) throw new HttpError(404, "slot not found");
      if (hasStarted(slot.start)) {
        throw new HttpError(400, "slot has already started");
      }

      // ponytail: check + insert has no await between them, so Node's single thread makes it atomic.
      if (!isAvailable(slot.id)) throw new HttpError(409, "slot already booked");

      const booking: Booking = {
        id: randomUUID(),
        slot_id,
        name,
        email,
        status: "confirmed",
        created_at: new Date().toISOString(),
      };
      db.bookings.push(booking);
      await save();
      return booking;
    },

    async getBooking(id) {
      return db.bookings.find((b) => b.id === id);
    },

    // Bookings are append-only (cancel just flips status), so an offset cursor is stable.
    async listBookings(email, cursor, limit) {
      const bookings = db.bookings.filter((b) => b.email === email);
      const next = cursor + limit;
      return {
        bookings: bookings.slice(cursor, next),
        next_cursor: next < bookings.length ? String(next) : null,
      };
    },

    async cancelBooking(id) {
      const booking = db.bookings.find((b) => b.id === id);
      if (!booking) throw new HttpError(404, "booking not found");
      if (booking.status === "cancelled") {
        throw new HttpError(409, "booking already cancelled");
      }

      booking.status = "cancelled";
      await save();
      return booking;
    },
  };
}
