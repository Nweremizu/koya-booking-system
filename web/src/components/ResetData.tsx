import { useState, type FormEvent } from 'react'
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
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage, type Slot } from '@/lib/api'

type Props = {
  slots: Slot[]
  onReset: () => void
}

const toJson = (slots: Slot[]) =>
  JSON.stringify(
    slots.map(({ id, provider, start, end }) => ({ id, provider, start, end })),
    null,
    2,
  )

export function ResetData({ slots, onReset }: Props) {
  const [text, setText] = useState(() => toJson(slots))
  const [adminKey, setAdminKey] = useState('')
  const [parsed, setParsed] = useState<Omit<Slot, 'available'>[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check the JSON before asking for confirmation; the API validates each slot's fields.
  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const value = JSON.parse(text)
      if (!Array.isArray(value)) throw new Error()
      setParsed(value)
    } catch {
      setError('Slots must be a JSON array, like [{"id": "s1", "provider": "Dr Ade", ...}].')
    }
  }

  async function reset() {
    if (!parsed) return
    setBusy(true)
    try {
      await api.reset(parsed, adminKey)
      toast.success(`Reset done: ${parsed.length} slots, no bookings.`)
      onReset()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      setParsed(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Reset data</h2>
        <p className="text-sm text-muted-foreground">
          Replaces every slot with the list below and deletes every booking.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="slots-json">Slots (JSON)</Label>
          <Textarea
            id="slots-json"
            required
            spellCheck={false}
            className="min-h-64 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="admin-key">Admin key</Label>
          <Input
            id="admin-key"
            type="password"
            required
            autoComplete="off"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div>
          <Button type="submit" variant="destructive" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset data'}
          </Button>
        </div>
      </form>

      <AlertDialog open={parsed !== null} onOpenChange={(open) => !open && setParsed(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all bookings?</AlertDialogTitle>
            <AlertDialogDescription>
              Every booking is deleted and the slots are replaced with the {parsed?.length ?? 0} in
              your list. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep data</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={reset}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
