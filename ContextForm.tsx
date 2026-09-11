import type { CommodityCategory, PackageContext } from '../types'

interface Props {
  value: PackageContext
  categories: CommodityCategory[]
  onChange: (next: PackageContext) => void
}

/**
 * Facts only the inspector knows.
 *
 * Two of these change the outcome a lot. The pack width converts print size
 * in the photo to millimetres, which is what Rule 7 is written in. The
 * exemption flags decide whether the Rules apply to this package at all.
 */
export function ContextForm({ value, categories, onChange }: Props) {
  const set = <K extends keyof PackageContext>(key: K, next: PackageContext[K]) =>
    onChange({ ...value, [key]: next })

  const setGeometry = <K extends keyof PackageContext['geometry']>(
    key: K,
    next: PackageContext['geometry'][K],
  ) => onChange({ ...value, geometry: { ...value.geometry, [key]: next } })

  return (
    <div className="card">
      <h2>About this package</h2>
      <p className="hint">
        These answers decide which rules apply. You can change them after the scan
        and re-check without taking another photo.
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor="package-type">Package type</label>
          <select
            id="package-type"
            value={value.package_type}
            onChange={(e) => set('package_type', e.target.value as PackageContext['package_type'])}
          >
            <option value="retail">Retail pack</option>
            <option value="wholesale">Wholesale pack</option>
            <option value="export">Export pack</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="commodity">Commodity</label>
          <select
            id="commodity"
            value={value.commodity_category ?? ''}
            onChange={(e) => set('commodity_category', e.target.value || null)}
          >
            <option value="">Detect from the label</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="width">Pack width (mm)</label>
          <input
            id="width"
            type="number"
            inputMode="decimal"
            min={5}
            max={2000}
            placeholder="e.g. 80"
            value={value.geometry.label_width_mm ?? ''}
            onChange={(e) =>
              setGeometry('label_width_mm', e.target.value ? Number(e.target.value) : null)
            }
          />
          <p className="note">
            The real width of the face you photographed. Without it, the print-size
            checks cannot run.
          </p>
        </div>

        <div className="field">
          <label htmlFor="print-style">Print style</label>
          <select
            id="print-style"
            value={value.geometry.print_style}
            onChange={(e) =>
              setGeometry('print_style', e.target.value as 'normal' | 'embossed')
            }
          >
            <option value="normal">Printed</option>
            <option value="embossed">Blown, moulded or embossed</option>
          </select>
          <p className="note">Moulded packs must use larger characters.</p>
        </div>
      </div>

      <details className="advanced">
        <summary>Exemptions, wrapper and measured quantity</summary>
        <div>
          <div className="checks">
            <Toggle
              label="Packed for industrial or institutional customers"
              hint="Rule 3(b): these fall outside the retail-label chapter."
              checked={value.industrial_or_institutional}
              onChange={(v) => set('industrial_or_institutional', v)}
            />
            <Toggle
              label="Fast food packed by a restaurant or hotel"
              hint="Rule 26(b)."
              checked={value.fast_food_by_restaurant}
              onChange={(v) => set('fast_food_by_restaurant', v)}
            />
            <Toggle
              label="Drug formulation under the Drugs (Price Control) Order"
              hint="Rule 26(c)."
              checked={value.drug_formulation_under_dpco}
              onChange={(v) => set('drug_formulation_under_dpco', v)}
            />
            <Toggle
              label="Agricultural produce"
              hint="Rule 26(d): exempt above 50 kg."
              checked={value.agricultural_produce}
              onChange={(v) => set('agricultural_produce', v)}
            />
            <Toggle
              label="Bidi, incense sticks, or PSU domestic LPG cylinder"
              hint="Rule 6: no manufacturing date or MRP is required."
              checked={value.psu_lpg_or_bidi}
              onChange={(v) => set('psu_lpg_or_bidi', v)}
            />
            <Toggle
              label="This pack has an outer wrapper"
              hint="Rule 9(3): a non-transparent wrapper must repeat the declarations."
              checked={value.outer_wrapper_present}
              onChange={(v) => set('outer_wrapper_present', v)}
            />
            {value.outer_wrapper_present && (
              <Toggle
                label="The wrapper is transparent and the inner print reads clearly"
                checked={value.outer_wrapper_transparent}
                onChange={(v) => set('outer_wrapper_transparent', v)}
              />
            )}
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="measured">Measured net quantity (g or ml)</label>
            <input
              id="measured"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Leave blank if not weighed"
              value={value.measured_net_quantity ?? ''}
              onChange={(e) =>
                set('measured_net_quantity', e.target.value ? Number(e.target.value) : null)
              }
            />
            <p className="note">
              From a Sixth Schedule test. Entering it runs the maximum-permissible-error
              check under Rule 22.
            </p>
          </div>
        </div>
      </details>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="check-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && (
          <>
            <br />
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{hint}</span>
          </>
        )}
      </span>
    </label>
  )
}
