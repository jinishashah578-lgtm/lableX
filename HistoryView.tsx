import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ScanSummary, Stats } from '../types'

const VERDICT_LABEL: Record<string, string> = {
  compliant: 'Compliant',
  non_compliant: 'Not compliant',
  needs_review: 'Needs review',
  exempt: 'Out of scope',
}

export function HistoryView({ onOpen }: { onOpen: (scanId: string) => void }) {
  const [scans, setScans] = useState<ScanSummary[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.scans(), api.stats()])
      .then(([s, st]) => {
        if (cancelled) return
        setScans(s)
        setStats(st)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="banner error">{error}</p>
  if (!scans || !stats) return <p className="empty">Loading past scans…</p>

  return (
    <div>
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{stats.total_scans}</div>
          <div className="k">Scans</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--fail)' }}>
            {stats.by_verdict.non_compliant ?? 0}
          </div>
          <div className="k">Not compliant</div>
        </div>
        <div className="stat">
          <div className="n">₹{(stats.total_penalty_inr / 1000).toFixed(1)}k</div>
          <div className="k">Rule 32 fines</div>
        </div>
      </div>

      {stats.top_violations.length > 0 && (
        <div className="card">
          <h2>Most common violations</h2>
          <p className="hint">Across the last 200 scans in this repository.</p>
          {stats.top_violations.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '7px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 13.5,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="rule" style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>
                  {v.rule}
                </span>
                <br />
                {v.title}
              </span>
              <strong style={{ flex: 'none' }}>{v.count}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Past scans</h2>
        {scans.length === 0 ? (
          <p className="empty">Nothing scanned yet. Take a photo of a pack to start.</p>
        ) : (
          scans.map((scan) => (
            <button key={scan.scan_id} className="scan-row" onClick={() => onOpen(scan.scan_id)}>
              <img
                className="thumb"
                src={api.imageUrl(scan.scan_id)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                }}
              />
              <span className="meta">
                <span className="name">{scan.commodity ?? 'Unnamed product'}</span>
                <span className="when">
                  {new Date(scan.created_at).toLocaleString()} · {scan.package_type}
                </span>
              </span>
              <span className={`pill ${scan.verdict === 'compliant' ? 'pass' : scan.verdict === 'non_compliant' ? 'fail' : 'warn'}`}>
                {VERDICT_LABEL[scan.verdict] ?? scan.verdict}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
