import { Inter } from "next/font/google"

// Inter is the app-wide font as of the jobright restyle (set on <body> in
// app/layout.tsx). Pages that adopted it earlier still wrap themselves in
// inter.className, which is now a harmless no-op.
export const inter = Inter({
  subsets: ["latin"],
})
