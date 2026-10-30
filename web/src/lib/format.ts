const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const stamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export const formatDay = (iso: string) => day.format(new Date(iso))
export const formatTime = (iso: string) => time.format(new Date(iso))
export const formatStamp = (iso: string) => stamp.format(new Date(iso))
export const hasStarted = (iso: string) => new Date(iso).getTime() <= Date.now()
