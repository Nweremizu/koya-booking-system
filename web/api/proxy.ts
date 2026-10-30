// Vercel function: forwards /api/* (see vercel.json) to the booking API on Render and adds
// the API key server-side, so the key never ships to the browser.
// Env (Vercel project settings): API_URL=https://<your-app>.onrender.com, API_KEY=<same key as Render>,
// ADMIN_KEY=<passcode for the Admin tab's reset; leave unset to disable it>
import { createHash, timingSafeEqual } from 'node:crypto'

const sameSecret = (a: string, b: string) => {
  const hash = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(hash(a), hash(b))
}

async function handler(request: Request): Promise<Response> {
  const { API_URL, API_KEY } = process.env
  if (!API_URL || !API_KEY) {
    return Response.json({ error: 'proxy is not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const path = url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/?/, '')
  url.searchParams.delete('path')

  const base = new URL(API_URL.replace(/\/*$/, '/'))
  const target = new URL(path + url.search, base)

  // A path like "//evil.com" would send our API key to another host.
  if (target.origin !== base.origin) {
    return Response.json({ error: 'bad path' }, { status: 400 })
  }
  // Wiping the database needs the admin key too. With ADMIN_KEY unset, /reset stays hidden.
  if (/\/reset\/*$/.test(target.pathname)) {
    const { ADMIN_KEY } = process.env
    if (!ADMIN_KEY) return Response.json({ error: 'not found' }, { status: 404 })
    if (!sameSecret(request.headers.get('x-admin-key') ?? '', ADMIN_KEY)) {
      return Response.json({ error: 'wrong admin key' }, { status: 401 })
    }
  }

  const headers = new Headers({ 'X-API-Key': API_KEY })
  for (const name of ['content-type', 'idempotency-key']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
  })

  const out = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) out.set('retry-after', retryAfter)

  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export { handler as GET, handler as POST, handler as DELETE }
