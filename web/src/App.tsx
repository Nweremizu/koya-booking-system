import { useEffect, useMemo, useState } from 'react'
import { StethoscopeIcon } from 'lucide-react'
import { BookSlots } from '@/components/BookSlots'
import { FindBooking } from '@/components/FindBooking'
import { MyBookings } from '@/components/MyBookings'
import { ResetData } from '@/components/ResetData'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, type Slot } from '@/lib/api'

const readEmail = () => {
  try {
    return localStorage.getItem('email') ?? ''
  } catch {
    return ''
  }
}

export default function App() {
  const [tab, setTab] = useState('book')
  const [email, setEmail] = useState(readEmail)
  const [allSlots, setAllSlots] = useState<Slot[]>([])
  const [version, setVersion] = useState(0)
  const refreshSlots = () => setVersion((v) => v + 1)

  // Unfiltered list: feeds the provider filter and lets booking cards show the slot's time.
  useEffect(() => {
    api.slots().then(setAllSlots).catch(() => {})
  }, [version])

  const slotsById = useMemo(() => new Map(allSlots.map((s) => [s.id, s])), [allSlots])
  const providers = useMemo(() => [...new Set(allSlots.map((s) => s.provider))].sort(), [allSlots])

  function rememberEmail(address: string) {
    setEmail(address)
    try {
      localStorage.setItem('email', address)
    } catch {
      // Private mode: just don't remember it.
    }
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <StethoscopeIcon className="size-5" />
          </div>
          <div>
            <h1 className="leading-tight font-semibold">Koya Clinic</h1>
            <p className="text-sm text-muted-foreground">Book an appointment online</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="book">Book</TabsTrigger>
            <TabsTrigger value="mine">My bookings</TabsTrigger>
            <TabsTrigger value="find">Find booking</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>
          <div className="rounded-xl border bg-background p-4 sm:p-6">
            <TabsContent value="book">
              <BookSlots
                providers={providers}
                version={version}
                email={email}
                onBooked={(b) => {
                  rememberEmail(b.email)
                  refreshSlots()
                }}
                onSlotsChanged={refreshSlots}
                onShowMyBookings={() => setTab('mine')}
              />
            </TabsContent>
            <TabsContent value="mine">
              <MyBookings
                email={email}
                onEmailChange={rememberEmail}
                slotsById={slotsById}
                onCancelled={refreshSlots}
              />
            </TabsContent>
            <TabsContent value="find">
              <FindBooking slotsById={slotsById} onCancelled={refreshSlots} />
            </TabsContent>
            <TabsContent value="admin">
              <ResetData slots={allSlots} onReset={refreshSlots} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
      <Toaster position="top-center" />
    </div>
  )
}
