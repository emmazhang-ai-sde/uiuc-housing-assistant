export interface Landmark {
  name: string
  lat: number
  lng: number
  aliases: string[]   // substrings the LLM might extract as location_hint
}

export const LANDMARKS: Landmark[] = [
  // ── Campus academic buildings ────────────────────────────────────────────
  {
    name: "Grainger Engineering Library",
    lat: 40.1125, lng: -88.2269,
    aliases: ["grainger", "engineering library", "grainger library"],
  },
  {
    name: "Siebel Center for Computer Science",
    lat: 40.1140, lng: -88.2244,
    aliases: ["siebel", "siebel center", "computer science building", "cs building"],
  },
  {
    name: "Campus Instructional Facility",
    lat: 40.1125, lng: -88.2283,
    aliases: ["cif", "campus instructional facility"],
  },
  {
    name: "Business Instructional Facility",
    lat: 40.1020, lng: -88.2310,
    aliases: ["bif", "business school", "gies", "business instructional facility", "gies business"],
  },
  {
    name: "Law Library",
    lat: 40.1010, lng: -88.2315,
    aliases: ["law library", "law school", "college of law", "law building"],
  },
  {
    name: "Main Quad",
    lat: 40.1072, lng: -88.2270,
    aliases: ["main quad", "quad", "main quadrangle"],
  },

  // ── Recreation ───────────────────────────────────────────────────────────
  {
    name: "ARC (Activities Recreation Center)",
    lat: 40.1016, lng: -88.2370,
    aliases: ["arc", "activities recreation", "recreation center", "gym"],
  },

  // ── Streets / districts ──────────────────────────────────────────────────
  {
    name: "Green Street (Campustown)",
    lat: 40.1096, lng: -88.2100,
    aliases: ["green street", "green st", "campustown"],
  },

  // ── Grocery / food ───────────────────────────────────────────────────────
  {
    name: "Fresh International Market",
    lat: 40.1112, lng: -88.2445,
    aliases: ["fresh", "fresh international", "fresh international market", "fresh market"],
  },
  {
    name: "Far East Grocery",
    lat: 40.1157, lng: -88.2323,
    aliases: ["far east", "far east grocery", "far east market", "asian grocery"],
  },
  {
    name: "McDonald's (Green St)",
    lat: 40.1105, lng: -88.2298,
    aliases: ["mcdonald's", "mcdonalds", "mcd", "mickey d's"],
  },

  // ── Retail / pharmacy ────────────────────────────────────────────────────
  {
    name: "Target (Campustown)",
    lat: 40.1102, lng: -88.2302,
    aliases: ["target", "campus target"],
  },
  {
    name: "Walgreens (Green St)",
    lat: 40.1100, lng: -88.2327,
    aliases: ["walgreens", "pharmacy"],
  },
]
