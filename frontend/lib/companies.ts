// Single source of truth for property management companies shown in the UI.
// To add a new company: drop its logo in public/logos/ and add one entry here —
// FilterPanel, ListingCard, SummaryTable, and Sidebar all pick it up automatically.
export interface Company {
  name: string
  logo: string
}

export const COMPANIES: Company[] = [
  { name: "Green Street Realty", logo: "/logos/company-logo-green-street-realty.png" },
  { name: "Universities Group",  logo: "/logos/company-logo-university-group.png" },
]

export const COMPANY_LOGOS: Record<string, string> = Object.fromEntries(
  COMPANIES.map(({ name, logo }) => [name, logo])
)
