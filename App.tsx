import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { CameraCapture } from './components/CameraCapture'
import { ContextForm } from './components/ContextForm'
import { HistoryView } from './components/HistoryView'
import { ReportView } from './components/ReportView'
import type { CommodityCategory, Health, PackageContext, ScanReport } from './types'

const DEFAULT_CONTEXT: PackageContext = {
  package_type: 'retail',
  commodity_category: null,
  industrial_or_institutional: false,
  fast_food_by_restaurant: false,
  drug_formulation_under_dpco: false,
  agricultural_produce: false,
  psu_lpg_or_bidi: false,
  outer_wrapper_present: false,
  outer_wrapper_transparent: true,
  measured_net_quantity: null,
  geometry: { label_width_mm: null, print_style: 'normal' },
}

type Tab = 'scan' | 'history'

export function App() {
  const [tab, setTab] = useState<Tab>('scan')
  const [context, setContext] = useState<PackageContext>(DEFAULT_CONTEXT)
  const [categories, setCategories] = useState<CommodityCategory[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [image, setImage] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [report, setReport] = useState<ScanReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    api.reference().then((r) => setCategories(r.commodity_categories)).catch(() => undefined)
    api.health()
      .then(setHealth)
      .catch((e: Error) => setHealthError(e.message))
  }, [])

  // Count the seconds while a scan runs. A model read takes tens of seconds,
  // and a spinner alone gives no sense of whether anything is happening.
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const startedAt = Date.now()
    const timer = window.setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [busy])

  // Release each object URL when it is replaced, so previews do not leak.
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onCapture = useCallback((blob: Blob, url: string) => {
    setImage(blob)
    setPreview(url)
    setReport(null)
    setError(null)
  }, [])

  const clearCapture = useCallback(() => {
    setImage(null)
    setPreview(null)
    setReport(null)
    setError(null)
  }, [])

  const runScan = useCallback(async () => {
    if (!image) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setBusy(true)
    setError(null)
    try {
      const result = await api.scan(image, context, controller.signal)
      setReport(result)
      setContext(result.context)   // keep whatever the backend inferred
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [image, context])

  const recheck = useCallback(async () => {
    if (!report) return
    setBusy(true)
    setError(null)
    try {
      setReport(await api.reevaluate(report.scan_id, context))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [report, context])

  const openScan = useCallback(async (scanId: string) => {
    setBusy(true)
    try {
      const stored = await api.scan_detail(scanId)
      setReport(stored)
      setContext(stored.context)
      setPreview(api.imageUrl(scanId))
      setImage(null)
      setTab('scan')
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  const activeReader = health?.extractors.find((e) => e.name === health.active_extractor)
  const usesModel = health?.active_extractor === 'openrouter'
  // Null until /api/health answers, and it may never answer. Everything below
  // has to read sensibly without it rather than printing "undefined".
  const readerLabel = !health
    ? null
    : activeReader?.model
      ? `${health.active_extractor} (${activeReader.model})`
      : health.active_extractor

  const readerNote =
    health && health.active_extractor === 'demo'
      ? 'No label reader is configured, so scans return fixed sample data. Set OPENROUTER_API_KEY, or install Tesseract, to read real photos.'
      : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-mark" aria-hidden>
          LX
        </div>
        <div style={{ minWidth: 0 }}>
          <h1>Label-X</h1>
          <p className="sub">
            Legal Metrology (Packaged Commodities) Rules, 2011
            {health && ` · reader: ${health.active_extractor}`}
          </p>
        </div>
      </header>

      <main>
        {tab === 'scan' ? (
          <>
            {healthError && (
              <p className="banner error">
                Could not reach the compliance server ({healthError}). Check that the
                API is running on port 8000.
              </p>
            )}
            {readerNote && <p className="banner warn">{readerNote}</p>}
            {error && <p className="banner error">{error}</p>}

            {!report && (
              <div className="card">
                <h2>Capture the label</h2>
                <p className="hint">
                  Point the camera at the front of the pack. Even light and a square-on
                  angle give the most reliable reading.
                </p>
                <CameraCapture
                  onCapture={onCapture}
                  preview={preview}
                  onClear={clearCapture}
                  disabled={busy}
                />
              </div>
            )}

            {!report && <ContextForm value={context} categories={categories} onChange={setContext} />}

            {!report && (
              <button className="btn btn-primary" onClick={runScan} disabled={!image || busy}>
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden />
                    Reading the label… {elapsed}s
                  </>
                ) : (
                  'Check compliance'
                )}
              </button>
            )}

            {busy && (
              <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
                {!readerLabel
                  ? 'Reading the photo…'
                  : usesModel
                    ? `Sending the photo to ${readerLabel}. A model read usually takes 5 to 40 seconds.`
                    : `Reading the photo with ${readerLabel}.`}
                {usesModel && elapsed > 45 && ' Still waiting — the model may be busy.'}
              </p>
            )}

            {report && (
              <>
                <ReportView report={report} />
                <ContextForm value={context} categories={categories} onChange={setContext} />
                <div className="capture-actions" style={{ marginBottom: 14 }}>
                  <button className="btn" onClick={recheck} disabled={busy}>
                    {busy ? 'Re-checking…' : 'Re-check with these answers'}
                  </button>
                  <button className="btn btn-primary" onClick={clearCapture} disabled={busy}>
                    Scan another
                  </button>
                </div>
              </>
            )}

            <p className="footnote">
              This tool summarises the Rules for inspection support. Verify the exact
              wording and current amendments against the Gazette notification before
              issuing any notice.
            </p>
          </>
        ) : (
          <HistoryView onOpen={openScan} />
        )}
      </main>

      <nav className="tabbar">
        <button aria-current={tab === 'scan'} onClick={() => setTab('scan')}>
          <CameraIcon />
          Scan
        </button>
        <button aria-current={tab === 'history'} onClick={() => setTab('history')}>
          <ListIcon />
          Repository
        </button>
      </nav>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-2h8.4l1.1 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
    </svg>
  )
}
