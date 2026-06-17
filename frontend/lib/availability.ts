export type AvailabilityStatus = "now" | "available" | "unavailable"

// beds === 0 means "studio" only when unit_type says so.
// Individual lease / roommate listings also have beds=0 but are not studios.
export function bedsLabel(beds: number, unitType: string): string {
  if (beds === 0) return /studio/i.test(unitType) ? "Studio" : ""
  return `${beds} bed`
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}

// Priority order matters: "now" phrases win even if the same string also
// says "available" (e.g. "Immediate Move-In! Available August 2026").
export function availabilityStatus(availability: string): AvailabilityStatus {
  const s = availability.toLowerCase()
  if (/immediate move-?in|move-?in today|available now|immediate(?:ly)? available/.test(s)) return "now"
  if (s.includes("available") && !s.includes("not available")) return "available"
  return "unavailable"
}

export function availabilitySortValue(availability: string): number {
  const status = availabilityStatus(availability)
  if (status === "unavailable") return 0
  if (status === "now") return 1

  const s = availability.toLowerCase()
  const monthYear = s.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/
  )

  if (monthYear) {
    const month = MONTH_INDEX[monthYear[1]]
    const year = Number(monthYear[2])
    return 2 + year * 12 + month
  }

  const numericDate = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (numericDate) {
    const month = Number(numericDate[1]) - 1
    const year = Number(numericDate[3])
    return 2 + year * 12 + month
  }

  return Number.MAX_SAFE_INTEGER
}

export function splitAvailabilityLines(availability: string): string[] {
  const parts: string[] = []
  let current = ""

  const isBreakMark = (index: number) => {
    const char = availability[index]
    if (",;:!".includes(char)) return true
    if (!"-–".includes(char)) return false

    const prev = availability[index - 1]
    const next = availability[index + 1]
    return /\s/.test(prev ?? "") || /\s/.test(next ?? "")
  }

  for (let i = 0; i < availability.length; i += 1) {
    current += availability[i]

    if (!isBreakMark(i)) continue

    while (i + 1 < availability.length && isBreakMark(i + 1)) {
      i += 1
      current += availability[i]
    }

    const part = current.trim()
    if (part) parts.push(part)
    current = ""
  }

  const tail = current.trim()
  if (tail) parts.push(tail)
  return parts
}
