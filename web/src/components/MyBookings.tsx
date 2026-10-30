import { useEffect, useState, type FormEvent } from 'react'
import { InboxIcon } from 'lucide-react'
import { BookingCard } from '@/components/BookingCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage, type Booking, type Slot } from '@/lib/api'

type Props = {
  email: string
  onEmailChange: (email: string) => void
  slotsById: Map<string, Slot>
  onCancelled: () => void
}

export function MyBookings({ email, onEmailChange, slotsById, onCancelled }: Props) {
  const [input, setInput] = useState(email)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cursor pagination: pass next_cursor back to get the following page.
  async function load(address: string, after?: string) {
    setLoading(true)
    setError(null)
    try {
      const page = await api.bookings(address, after)
      setBookings((prev) => (after && prev ? [...prev, ...page.bookings] : page.bookings))
      setCursor(page.next_cursor)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (email) load(email)
  }, [email])

  function submit(e: FormEvent) {
    e.preventDefault()
    const address = input.trim().toLowerCase()
    if (address === email) load(address)
    else onEmailChange(address)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">My bookings</h2>
        <p className="text-sm text-muted-foreground">Enter the email you booked with.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="lookup-email">Email</Label>
          <Input
            id="lookup-email"
            type="email"
            required
            autoComplete="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          Show bookings
        </Button>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {loading && !bookings ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : bookings?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <InboxIcon className="size-6" />
          <p className="text-sm">No bookings for {email} yet.</p>
        </div>
      ) : (
        bookings && (
          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                slot={slotsById.get(b.slot_id)}
                onCancelled={(updated) => {
                  setBookings((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
                  onCancelled()
                }}
              />
            ))}
            {cursor && (
              <Button variant="outline" className="w-full" disabled={loading} onClick={() => load(email, cursor)}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        )
      )}
    </div>
  )
}
