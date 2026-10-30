import postgres from "postgres";
import { Booking } from "../type.js";
import { HttpError, Store, hasStarted } from "./index.js";

// Runs on every start; safe to repeat. You can also paste it into the Neon / Supabase SQL editor.
export const SCHEMA = `
create table if not exists slots (
  id       text primary key,
  provider text not null,
  -- kept as text so the API echoes exactly what /reset was given
  start_at text not null,
  end_at   text not null
);

create table if not exists bookings (
  seq        bigserial primary key, -- insertion order, used as the pagination cursor
  id         text not null unique default gen_random_uuid()::text,
  slot_id    text not null references slots (id) on delete cascade,
  name       text not null,
  email      text not null,
  status     text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- At most one confirmed booking per slot. The database enforces it, so it holds
-- under concurrent requests and across any number of API instances.
create unique index if not exists bookings_one_confirmed_per_slot
  on bookings (slot_id) where status = 'confirmed';

create index if not exists bookings_email_seq on bookings (email, seq);
`;

type BookingRow = Omit<Booking, "created_at"> & { created_at: Date };

const toBooking = (row: BookingRow): Booking => ({
  id: row.id,
  slot_id: row.slot_id,
  name: row.name,
  email: row.email,
  status: row.status,
  created_at: row.created_at.toISOString(),
});

export async function createPostgresStore(url: string): Promise<Store> {
  // prepare: false keeps Supabase's transaction pooler (port 6543) working; Neon doesn't mind.
  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  await sql.unsafe(SCHEMA);

  const cols = sql`id, slot_id, name, email, status, created_at`;

  return {
    async reset(slots) {
      await sql.begin(async (tx) => {
        await tx`delete from bookings`;
        await tx`delete from slots`;
        if (slots.length) {
          const rows = slots.map((s) => ({
            id: s.id,
            provider: s.provider,
            start_at: s.start,
            end_at: s.end,
          }));
          await tx`insert into slots ${tx(rows, "id", "provider", "start_at", "end_at")}`;
        }
      });
    },

    async listSlots(provider) {
      return sql`
        select s.id, s.provider, s.start_at as start, s.end_at as "end",
               not exists (
                 select 1 from bookings b
                 where b.slot_id = s.id and b.status = 'confirmed'
               ) as available
        from slots s
        where ${provider ? sql`s.provider = ${provider}` : sql`true`}
        order by s.start_at::timestamptz, s.id
      `;
    },

    async createBooking({ slot_id, name, email }) {
      const [slot] = await sql`select start_at from slots where id = ${slot_id}`;
      if (!slot) throw new HttpError(404, "slot not found");
      if (hasStarted(slot.start_at)) {
        throw new HttpError(400, "slot has already started");
      }

      try {
        const [row] = await sql<BookingRow[]>`
          insert into bookings (slot_id, name, email)
          values (${slot_id}, ${name}, ${email})
          returning ${cols}
        `;
        return toBooking(row);
      } catch (err: any) {
        if (err.code === "23505") throw new HttpError(409, "slot already booked");
        // A /reset removed the slot between the lookup and the insert.
        if (err.code === "23503") throw new HttpError(404, "slot not found");
        throw err;
      }
    },

    async getBooking(id) {
      const [row] = await sql<BookingRow[]>`select ${cols} from bookings where id = ${id}`;
      return row && toBooking(row);
    },

    // Keyset pagination on seq: stable even while new bookings arrive.
    async listBookings(email, cursor, limit) {
      const rows = await sql<(BookingRow & { seq: string })[]>`
        select seq, ${cols} from bookings
        where email = ${email} and seq > ${cursor}
        order by seq
        limit ${limit + 1}
      `;
      const page = rows.slice(0, limit);
      return {
        bookings: page.map(toBooking),
        next_cursor: rows.length > limit ? page[page.length - 1].seq : null,
      };
    },

    async cancelBooking(id) {
      const [row] = await sql<BookingRow[]>`
        update bookings set status = 'cancelled'
        where id = ${id} and status = 'confirmed'
        returning ${cols}
      `;
      if (row) return toBooking(row);

      const [exists] = await sql`select 1 from bookings where id = ${id}`;
      throw exists
        ? new HttpError(409, "booking already cancelled")
        : new HttpError(404, "booking not found");
    },
  };
}
