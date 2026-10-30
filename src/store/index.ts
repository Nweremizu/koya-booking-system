import path from "path";
import { Booking, Slot } from "../type.js";

export type SlotWithAvailability = Slot & { available: boolean };
export type NewBooking = { slot_id: string; name: string; email: string };
export type BookingPage = { bookings: Booking[]; next_cursor: string | null };

// Every storage backend implements this. Business-rule failures throw HttpError,
// which the error handler turns into {"error": ...} with the right status.
export interface Store {
  reset(slots: Slot[]): Promise<void>;
  listSlots(provider?: string): Promise<SlotWithAvailability[]>;
  /** Throws 404 (no slot), 400 (slot started), 409 (slot taken). */
  createBooking(input: NewBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  /** Oldest first. `cursor` is whatever the previous page returned as next_cursor (0 to start). */
  listBookings(email: string, cursor: number, limit: number): Promise<BookingPage>;
  /** Throws 404 (no booking), 409 (already cancelled). */
  cancelBooking(id: string): Promise<Booking>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const hasStarted = (start: string) =>
  new Date(start).getTime() <= Date.now();

// DATABASE_URL set (Neon, Supabase, any Postgres) -> Postgres. Otherwise db.json in the working directory.
export const createStore = async (): Promise<Store> => {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { createPostgresStore } = await import("./postgres.js");
    return createPostgresStore(url);
  }

  const { createJsonStore } = await import("./json.js");
  return createJsonStore(path.join(process.cwd(), "db.json"));
};
