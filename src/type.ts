export type Slot = {
  id: string;
  provider: string;
  start: string; // ISO 8601 date string
  end: string; // ISO 8601 date string
};

export type Booking = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: string; // ISO 8601 date string
};

export type DbJson = {
  slots: Slot[];
  bookings: Booking[];
};
