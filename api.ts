import type { Health, PackageContext, Reference, ScanReport, ScanSummary, Stats } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const body = await response.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* the error body was not JSON; keep the status message */
    }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export const api = {
  health: () => fetch(`${BASE}/api/health`).then(json<Health>),

  reference: () => fetch(`${BASE}/api/reference`).then(json<Reference>),

  stats: () => fetch(`${BASE}/api/stats`).then(json<Stats>),

  scan(image: Blob, context: PackageContext, signal?: AbortSignal) {
    const form = new FormData()
    const name = image instanceof File ? image.name : 'capture.jpg'
    form.append('image', image, name)
    form.append('options', JSON.stringify({ context }))
    return fetch(`${BASE}/api/scan`, { method: 'POST', body: form, signal }).then(json<ScanReport>)
  },

  reevaluate(scanId: string, context: PackageContext) {
    return fetch(`${BASE}/api/scans/${scanId}/reevaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    }).then(json<ScanReport>)
  },

  scans: (limit = 50) =>
    fetch(`${BASE}/api/scans?limit=${limit}`)
      .then(json<{ scans: ScanSummary[] }>)
      .then((r) => r.scans),

  scan_detail: (scanId: string) => fetch(`${BASE}/api/scans/${scanId}`).then(json<ScanReport>),

  remove: (scanId: string) =>
    fetch(`${BASE}/api/scans/${scanId}`, { method: 'DELETE' }).then(json<{ deleted: string }>),

  imageUrl: (scanId: string) => `${BASE}/api/scans/${scanId}/image`,
}
