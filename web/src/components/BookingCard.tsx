import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { api, errorMessage, type Booking, type Slot } from '@/lib/api'
import { formatDay, formatStamp, formatTime, hasStarted } from '@/lib/format'

type Props = {
  booking: Booking
  slot?: Slot
  onCancelled: (booking: Booking) => void
}

export function BookingCard({ booking, slot, onCancelled }: Props) {
  const [busy, setBusy] = useState(false)
  const confirmed = booking.status === 'confirmed'
  const when = slot ? `${formatDay(slot.start)}, ${formatTime(slot.start)}` : `Slot ${booking.slot_id}`

  async function cancel() {
    setBusy(true)
    try {
      onCancelled(await api.cancel(booking.id))
      toast.success('Booking cancelled. The slot is open again.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={confirmed ? undefined : 'opacity-70'}>
      <CardHeader>
        <CardTitle className={confirmed ? undefined : 'line-through'}>{when}</CardTitle>
        <CardDescription>{slot?.provider ?? 'Provider unknown'}</CardDescription>
        <CardAction>
          <Badge variant={confirmed ? 'default' : 'secondary'} className="capitalize">
            {booking.status}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Patient</dt>
          <dd>{booking.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{booking.email}</dd>
          <dt className="text-muted-foreground">Booked</dt>
          <dd>{formatStamp(booking.created_at)}</dd>
          <dt className="text-muted-foreground">Booking ID</dt>
          <dd className="font-mono text-xs break-all">{booking.id}</dd>
        </dl>
      </CardContent>
      {confirmed && !(slot && hasStarted(slot.start)) && (
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy}>
                {busy ? 'Cancelling…' : 'Cancel booking'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
                <AlertDialogDescription>
                  {when}
                  {slot ? ` with ${slot.provider}` : ''}. The slot will be released for someone
                  else to book.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={cancel}>
                  Cancel booking
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      )}
    </Card>
  )
}
