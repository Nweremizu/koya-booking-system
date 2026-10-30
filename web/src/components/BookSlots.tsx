import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarX2Icon, CheckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api, errorMessage, type Booking, type Slot } from '@/lib/api'
import { formatDay, formatTime, hasStarted } from '@/lib/format'

const ALL = '__all'

type Props = {
  providers: string[]
  version: number
  email: string
  onBooked: (booking: Booking) => void
  onSlotsChanged: () => void
  onShowMyBookings: () => void
}

export function BookSlots({ providers, version, email, onBooked, onSlotsChanged, onShowMyBookings }: Props) {
  const [provider, setProvider] = useState(ALL)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Slot | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    setError(null)
    // Exercises GET /slots?provider= rather than filtering client-side.
    api
      .slots(provider === ALL ? undefined : provider)
      .then((s) => live && setSlots(s))
      .catch((err) => live && setError(errorMessage(err)))
    return () => {
      live = false
    }
  }, [provider, version])

  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>()
    for (const s of slots ?? []) {
      const key = formatDay(s.start)
      groups.set(key, [...(groups.get(key) ?? []), s])
    }
    return [...groups]
  }, [slots])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Available appointments</h2>
          <p className="text-sm text-muted-foreground">Pick a time, then add your details.</p>
        </div>
        <Select value={provider} onValueChange={(v) => { setSlots(null); setProvider(v) }}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : !slots ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[66px] rounded-lg" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <CalendarX2Icon className="size-6" />
          <p className="text-sm">No appointments have been published yet.</p>
        </div>
      ) : (
        days.map(([day, items]) => (
          <section key={day} aria-label={day}>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{day}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((s) => {
                const past = hasStarted(s.start)
                const bookable = s.available && !past
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!bookable}
                    onClick={() => {
                      setSelected(s)
                      setOpen(true)
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:bg-card"
                  >
                    <span>
                      <span className="block font-medium tabular-nums">
                        {formatTime(s.start)} – {formatTime(s.end)}
                      </span>
                      <span className="block text-sm text-muted-foreground">{s.provider}</span>
                    </span>
                    {bookable ? (
                      <Badge variant="outline">Open</Badge>
                    ) : (
                      <Badge variant="secondary">{past ? 'Past' : 'Booked'}</Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {selected && (
          <BookForm
            key={selected.id}
            slot={selected}
            defaultEmail={email}
            onBooked={onBooked}
            onConflict={onSlotsChanged}
            onClose={() => setOpen(false)}
            onShowMyBookings={() => {
              setOpen(false)
              onShowMyBookings()
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

type FormProps = {
  slot: Slot
  defaultEmail: string
  onBooked: (booking: Booking) => void
  onConflict: () => void
  onClose: () => void
  onShowMyBookings: () => void
}

function BookForm({ slot, defaultEmail, onBooked, onConflict, onClose, onShowMyBookings }: FormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(defaultEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)

  // One key per (slot, name, email): a double-click or a retry after a dropped
  // connection replays the original booking instead of creating a second one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [name, email])

  const when = `${formatDay(slot.start)} at ${formatTime(slot.start)}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const b = await api.book({ slot_id: slot.id, name, email }, idempotencyKey)
      setBooking(b)
      onBooked(b)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Someone just booked this slot. Please pick another time.'
          : errorMessage(err),
      )
      if (err instanceof ApiError && err.status === 409) onConflict()
    } finally {
      setBusy(false)
    }
  }

  if (booking) {
    return (
      <DialogContent>
        <DialogHeader className="items-center text-center">
          <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-5" />
          </div>
          <DialogTitle>You're booked</DialogTitle>
          <DialogDescription>
            {when} with {slot.provider}. Keep your booking ID to look it up later.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 p-4 text-sm">
          <dt className="text-muted-foreground">Booking ID</dt>
          <dd className="font-mono text-xs break-all">{booking.id}</dd>
          <dt className="text-muted-foreground">Patient</dt>
          <dd>{booking.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{booking.email}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="capitalize">{booking.status}</dd>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={onShowMyBookings}>
            View my bookings
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    )
  }

  return (
    <DialogContent>
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Book this appointment</DialogTitle>
          <DialogDescription>
            {when} with {slot.provider}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Booking…' : 'Confirm booking'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
