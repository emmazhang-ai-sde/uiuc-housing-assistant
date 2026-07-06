// Single source of truth for property management companies shown in the UI.
// To add a new company: drop its logo in public/logos/ and add one entry here —
// FilterPanel, ListingCard, SummaryTable, and Sidebar all pick it up automatically.
export interface Company {
  name: string
  logo: string
}

export const COMPANIES: Company[] = [
  { name: "Green Street Realty",  logo: "/logos/company-logo-green-street-realty.png" },
  { name: "Universities Group",   logo: "/logos/company-logo-university-group.png" },
  { name: "Smile Student Living", logo: "/logos/company-logo-smile.png" },
  { name: "MHM Properties",       logo: "/logos/company-logo-mhm-properties.png" },
  { name: "Seven07",              logo: "/logos/company-logo-707.svg" },
  { name: "Bankier Apartments",   logo: "/logos/company-logo-bankier.png" },
  { name: "Roland Realty",        logo: "/logos/company-logo-roland.png" },
  { name: "JSJ Property Management", logo: "/logos/company-logo-jsj.webp" },
]

export const COMPANY_LOGOS: Record<string, string> = Object.fromEntries(
  COMPANIES.map(({ name, logo }) => [name, logo])
)

// Companies we can't include, shown as muted chips in the FilterBar Source
// section so users know they weren't forgotten. `reason` renders as a tooltip.
// `logo` is optional — add one to public/logos/ and set it here to upgrade the
// chip from text to a logo; set `dark: true` for white-on-transparent brand
// assets so the chip gets a dark background. Full rationale per company lives in
// design-docs/ai-pipeline-implementation-phases/phase-9-expanded-company-coverage.md
export interface ExcludedCompany {
  name: string
  reason: string
  logo?: string
  dark?: boolean
}

export const UNSCRAPABLE_COMPANIES: ExcludedCompany[] = [
  { name: "The Dean",      reason: "Site terms prohibit republishing listing data", logo: "/logos/company-logo-dean.svg" },
  { name: "Hub",           reason: "Site terms prohibit scraping and republishing", logo: "/logos/company-logo-hub.svg" },
  { name: "309 Green",     reason: "Site terms prohibit scraping and republishing", logo: "/logos/company-logo-309-green.png", dark: true },
  { name: "The Linc",      reason: "Site terms prohibit republishing listing data", logo: "/logos/company-logo-the-linc.svg" },
  { name: "Campus Circle", reason: "Bot protection blocks automated access", logo: "/logos/company-logo-campus-circle.webp", dark: true },
  { name: "Latitude",      reason: "Bot protection blocks automated access", logo: "/logos/company-logo-latitude.png", dark: true },
  { name: "Burnham 310",   reason: "Pricing sits behind bot protection", logo: "/logos/company-logo-burnham-310.png" },
]

export const FULLY_LEASED_COMPANIES: ExcludedCompany[] = [
  { name: "JSM", reason: "Fully leased for 2026-27, no unit data published until next leasing season", logo: "/logos/company-logo-jsm.png" },
]
