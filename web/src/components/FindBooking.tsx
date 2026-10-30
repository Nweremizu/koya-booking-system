import { useState, type FormEvent } from 'react'
import { BookingCard } from '@/components/BookingCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, errorMessage, type Booking, type Slot } from '@/lib/api'

type Props = {
  slotsById: Map<string, Slot>
  onCancelled: () => void
}

export function FindBooking({ slotsById, onCancelled }: Props) {
  const [id, setId] = useState('')
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setBooking(null)
    try {
      setBooking(await api.booking(id.trim()))
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No booking found with that ID.'
          : errorMessage(err),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Find a booking</h2>
        <p className="text-sm text-muted-foreground">Use the booking ID from your confirmation.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="booking-id">Booking ID</Label>
          <Input
            id="booking-id"
            required
            className="font-mono"
            autoComplete="off"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Looking…' : 'Look up'}
        </Button>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {booking && (
        <BookingCard
          booking={booking}
          slot={slotsById.get(booking.slot_id)}
          onCancelled={(updated) => {
            setBooking(updated)
            onCancelled()
          }}
        />
      )}
    </div>
  )
}
