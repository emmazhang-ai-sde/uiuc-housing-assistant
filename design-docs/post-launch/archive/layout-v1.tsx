import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { COMPANIES } from "@/lib/companies";
import { FiltersProvider } from "@/contexts/FiltersContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UIUC Housing Assistant",
  description: `Search ${COMPANIES.map(c => c.name).join(" + ")} listings by price, beds, and location.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${nunitoSans.className} min-h-full flex flex-col`}>
        <FiltersProvider>
          <AuthModalProvider>{children}</AuthModalProvider>
        </FiltersProvider>
      </body>
    </html>
  );
}
