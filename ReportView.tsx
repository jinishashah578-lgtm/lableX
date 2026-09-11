import { useMemo, useState } from 'react'
import type { CheckResult, ScanReport, Status } from '../types'

const STATUS_ICON: Record<Status, string> = {
  pass: '✓',
  fail: '!',
  warn: '!',
  indeterminate: '?',
  not_applicable: '–',
}

const STATUS_LABEL: Record<Status, string> = {
  pass: 'Passed',
  fail: 'Violations',
  warn: 'Warnings',
  indeterminate: 'Could not be judged',
  not_applicable: 'Not applicable',
}

const VERDICT_TEXT: Record<ScanReport['verdict'], { label: string; detail: string }> = {
  compliant: {
    label: 'Compliant',
    detail: 'Every applicable declaration was found and met its rule.',
  },
  non_compliant: {
    label: 'Not compliant',
    detail: 'At least one mandatory declaration is missing or wrongly made.',
  },
  needs_review: {
    label: 'Needs review',
    detail: 'Nothing failed outright, but some checks could not be settled from this photo.',
  },
  exempt: {
    label: 'Out of scope',
    detail: 'No check applied to this package, so it is neither compliant nor in breach.',
  },
}

const GROUP_ORDER: Status[] = ['fail', 'warn', 'indeterminate', 'pass', 'not_applicable']

export function ReportView({ report }: { report: ScanReport }) {
  const grouped = useMemo(() => {
    const map = new Map<Status, CheckResult[]>()
    for (const check of report.checks) {
      const list = map.get(check.status) ?? []
      list.push(check)
      map.set(check.status, list)
    }
    return map
  }, [report])

  const failing = grouped.get('fail') ?? []
  const verdict = VERDICT_TEXT[report.verdict]

  return (
    <div>
      <div className={`verdict ${report.verdict}`}>
        <ScoreDial score={report.score} verdict={report.verdict} />
        <div style={{ minWidth: 0 }}>
          <p className="label">{verdict.label}</p>
          <p className="detail">{verdict.detail}</p>
          <div className="tally">
            {GROUP_ORDER.map((status) => {
              const n = report.counts[status] ?? 0
              return n > 0 ? (
                <span key={status} className={`pill ${status}`}>
                  {n} {STATUS_LABEL[status].toLowerCase()}
                </span>
              ) : null
            })}
          </div>
        </div>
      </div>

      {report.total_penalty_inr > 0 && (
        <p className="banner error">
          <strong>Rule 32 fines: ₹{report.total_penalty_inr.toLocaleString('en-IN')}</strong> across{' '}
          {new Set(failing.map((c) => c.rule.split('(')[0].trim())).size} contravened rule(s).
          The Legal Metrology Act, 2009 sets separate and generally higher penalties for
          specific offences — check sections 25 to 36 before issuing a notice.
        </p>
      )}

      {report.extracted.notes.length > 0 && (
        <div className="banner info">
          {report.extracted.notes.map((note, i) => (
            <div key={i}>{note}</div>
          ))}
        </div>
      )}

      {report.image_url && <LabelImage report={report} />}

      {GROUP_ORDER.map((status) => {
        const checks = grouped.get(status)
        if (!checks?.length) return null
        return (
          <section key={status}>
            <h3 className="group-head">
              {STATUS_LABEL[status]} ({checks.length})
            </h3>
            {checks.map((check) => (
              <CheckCard key={check.id} check={check} defaultOpen={status === 'fail'} />
            ))}
          </section>
        )
      })}

      <ExtractedPanel report={report} />
    </div>
  )
}

/** A ring showing the share of applicable checks that passed. */
function ScoreDial({ score, verdict }: { score: number; verdict: ScanReport['verdict'] }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const exempt = verdict === 'exempt'
  const filled = exempt ? 0 : (Math.max(0, Math.min(100, score)) / 100) * circumference
  const colour =
    verdict === 'compliant'
      ? 'var(--pass)'
      : verdict === 'non_compliant'
        ? 'var(--fail)'
        : verdict === 'exempt'
          ? 'var(--unknown)'
          : 'var(--warn)'

  return (
    <svg
      className="dial"
      viewBox="0 0 68 68"
      role="img"
      aria-label={exempt ? 'No checks applied to this package' : `Compliance score ${score} out of 100`}
    >
      <circle cx="34" cy="34" r={radius} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="39" textAnchor="middle" fontSize="18">
        {exempt ? '–' : score}
      </text>
    </svg>
  )
}

/** The photo, with a box drawn over whatever the selected check refers to. */
function LabelImage({ report }: { report: ScanReport }) {
  const boxed = report.checks.filter((c) => c.bbox && c.status === 'fail')
  const [selected, setSelected] = useState(0)
  const active = boxed[selected]

  return (
    <div className="card">
      <h2>The label you scanned</h2>
      <p className="hint">
        {boxed.length > 0
          ? 'The blue dashes mark the principal display panel. The red box marks the violation below.'
          : 'The blue dashes mark the principal display panel.'}
      </p>
      <div className="overlay-wrap">
        <img src={report.image_url ?? ''} alt="The scanned package label" />
        {report.extracted.pdp_bbox && (
          <div
            className="overlay-box pdp"
            style={boxStyle(report.extracted.pdp_bbox)}
            aria-hidden
          />
        )}
        {active?.bbox && <div className="overlay-box" style={boxStyle(active.bbox)} aria-hidden />}
      </div>

      {boxed.length > 1 && (
        <div className="capture-actions" style={{ flexWrap: 'wrap' }}>
          {boxed.map((check, i) => (
            <button
              key={check.id}
              className="btn"
              style={{
                flex: '0 1 auto',
                fontSize: 12,
                minHeight: 38,
                borderColor: i === selected ? 'var(--accent)' : 'var(--border)',
                color: i === selected ? 'var(--accent)' : undefined,
              }}
              onClick={() => setSelected(i)}
            >
              {check.rule}
            </button>
          ))}
        </div>
      )}
      {active && (
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Showing <strong>{active.rule}</strong> — {active.title}
        </p>
      )}
    </div>
  )
}

function boxStyle(box: { x: number; y: number; w: number; h: number }) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  }
}

function CheckCard({ check, defaultOpen }: { check: CheckResult; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <article className={`check ${check.status}`}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="icon" aria-hidden>
          {STATUS_ICON[check.status]}
        </span>
        <span className="head">
          <span className="rule">{check.rule}</span>
          <div className="title">{check.title}</div>
          <div className="msg">{check.message}</div>
        </span>
      </button>

      {open && (
        <div className="body">
          <dl>
            <dt>What the rule requires</dt>
            <dd>{check.requirement}</dd>

            {check.evidence && (
              <>
                <dt>Read from the label</dt>
                <dd className="evidence">{check.evidence}</dd>
              </>
            )}

            {check.fix_hint && (
              <>
                <dt>How to fix it</dt>
                <dd>{check.fix_hint}</dd>
              </>
            )}
          </dl>
          {check.penalty_inr ? (
            <span className="penalty-note">
              Rule 32 default fine: ₹{check.penalty_inr.toLocaleString('en-IN')}
            </span>
          ) : null}
        </div>
      )}
    </article>
  )
}

/** What the reader actually got off the pack, so a wrong reading is visible. */
function ExtractedPanel({ report }: { report: ScanReport }) {
  const [open, setOpen] = useState(false)
  const e = report.extracted
  const party = e.parties[0]

  const value = (v: unknown, fallback = 'Not found') =>
    v ? <dd>{String(v)}</dd> : <dd className="missing">{fallback}</dd>

  return (
    <div className="card">
      <h2>What was read off the label</h2>
      <p className="hint">
        Read by <strong>{e.extractor}</strong>. If any line here is wrong, the finding
        above is wrong too — retake the photo straight on, in even light.
      </p>

      <dl className="kv">
        <dt>Commodity</dt>
        {value(e.commodity_name)}

        <dt>Net quantity</dt>
        {value(e.net_quantity.value ? `${e.net_quantity.value} ${e.net_quantity.unit ?? ''}` : null)}

        <dt>Retail price</dt>
        {value(e.retail_price.raw_text)}

        <dt>Date</dt>
        {value(
          e.manufacture_date.month && e.manufacture_date.year
            ? `${String(e.manufacture_date.month).padStart(2, '0')}/${e.manufacture_date.year}`
            : null,
        )}

        <dt>Manufacturer</dt>
        {value(party?.name)}

        <dt>Address</dt>
        {value(party?.address)}

        <dt>Consumer care</dt>
        {value(
          [e.consumer_care.phone, e.consumer_care.email].filter(Boolean).join(' · ') || null,
        )}

        <dt>Languages</dt>
        {value(e.languages.join(', ') || null, 'None detected')}
      </dl>

      <button
        className="btn btn-ghost"
        style={{ marginTop: 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide the raw text' : 'Show the raw text'}
      </button>
      {open && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            background: 'var(--surface-2)',
            padding: 12,
            borderRadius: 8,
            marginTop: 10,
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          {e.raw_text || '(nothing was read)'}
        </pre>
      )}
    </div>
  )
}
