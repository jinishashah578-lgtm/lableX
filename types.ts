export type Status = 'pass' | 'fail' | 'warn' | 'indeterminate' | 'not_applicable'
export type Severity = 'critical' | 'major' | 'minor' | 'info'
export type Verdict = 'compliant' | 'non_compliant' | 'needs_review' | 'exempt'

export interface BBox { x: number; y: number; w: number; h: number }

export interface CheckResult {
  id: string
  rule: string
  title: string
  status: Status
  severity: Severity
  message: string
  requirement: string
  evidence?: string | null
  bbox?: BBox | null
  penalty_inr?: number | null
  fix_hint?: string | null
}

export interface PackageGeometry {
  label_width_mm?: number | null
  label_height_mm?: number | null
  image_width_px?: number | null
  image_height_px?: number | null
  print_style: 'normal' | 'embossed'
}

export interface PackageContext {
  package_type: 'retail' | 'wholesale' | 'export'
  commodity_category?: string | null
  industrial_or_institutional: boolean
  fast_food_by_restaurant: boolean
  drug_formulation_under_dpco: boolean
  agricultural_produce: boolean
  psu_lpg_or_bidi: boolean
  outer_wrapper_present: boolean
  outer_wrapper_transparent: boolean
  measured_net_quantity?: number | null
  geometry: PackageGeometry
}

export interface ExtractedLabel {
  raw_text: string
  commodity_name?: string | null
  pdp_bbox?: BBox | null
  parties: Array<{
    role: string
    name?: string | null
    address?: string | null
    pincode?: string | null
  }>
  net_quantity: {
    raw_text?: string | null
    value?: number | null
    unit?: string | null
    unit_kind?: string | null
  }
  retail_price: {
    raw_text?: string | null
    value?: number | null
    has_inclusive_of_taxes_wording: boolean
  }
  manufacture_date: { raw_text?: string | null; month?: number | null; year?: number | null }
  consumer_care: {
    name?: string | null
    address?: string | null
    phone?: string | null
    email?: string | null
  }
  languages: string[]
  extractor: string
  notes: string[]
}

export interface ScanReport {
  scan_id: string
  created_at: string
  package_type: string
  commodity_name?: string | null
  extractor: string
  score: number
  verdict: Verdict
  counts: Record<Status, number>
  total_penalty_inr: number
  checks: CheckResult[]
  extracted: ExtractedLabel
  context: PackageContext
  image_url?: string | null
}

export interface ScanSummary {
  scan_id: string
  created_at: string
  commodity?: string | null
  package_type: string
  verdict: Verdict
  score: number
  fail_count: number
  penalty_inr: number
  extractor: string
  image_file?: string | null
}

export interface Stats {
  total_scans: number
  by_verdict: Partial<Record<Verdict, number>>
  total_penalty_inr: number
  top_violations: Array<{ id: string; rule: string; title: string; count: number }>
}

export interface CommodityCategory {
  key: string
  label: string
  unit: string
  sizes: number[]
}

export interface Reference {
  commodity_categories: CommodityCategory[]
  banned_qualifiers: string[]
  penalties: { registration_or_advertisement_inr: number; default_inr: number }
}

export interface Health {
  status: string
  /** `model` is present only for readers that call one, such as OpenRouter. */
  extractors: Array<{ name: string; available: boolean; model?: string }>
  active_extractor: string
}
