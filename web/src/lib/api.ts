export type Slot = {
  id: string
  provider: string
  start: string
  end: string
  available: boolean
}

export type Booking = {
  id: string
  slot_id: string
  name: string
  email: string
  status: 'confirmed' | 'cancelled'
  created_at: string
}

export type NewBooking = { slot_id: string; name: string; email: string }

export class ApiError extends Error {
  status: number
  retryAfter?: number

  constructor(status: number, message: string, retryAfter?: number) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// Everything goes through /api on our own origin. The Vite dev proxy (locally) or
// api/[...path].ts (on Vercel) forwards it to the booking API and adds the API key.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await res.json().catch(() => null)

  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, retryAfter)
  }
  return body as T
}

export const api = {
  slots: (provider?: string) =>
    request<{ slots: Slot[] }>(
      provider ? `/slots?${new URLSearchParams({ provider })}` : '/slots',
    ).then((r) => r.slots),

  book: (input: NewBooking, idempotencyKey: string) =>
    request<Booking>('/bookings', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  booking: (id: string) => request<Booking>(`/bookings/${encodeURIComponent(id)}`),

  bookings: (email: string, cursor?: string) =>
    request<{ bookings: Booking[]; next_cursor: string | null }>(
      `/bookings?${new URLSearchParams({ email, limit: '5', ...(cursor ? { cursor } : {}) })}`,
    ),

  cancel: (id: string) =>
    request<Booking>(`/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'The booking service rejected our API key.'
    if (err.status === 429) {
      return `Too many attempts. Try again in ${err.retryAfter ?? 60} seconds.`
    }
    return err.message.charAt(0).toUpperCase() + err.message.slice(1) + '.'
  }
  return "Can't reach the booking service. Check your connection and try again."
}
