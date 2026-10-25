import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SITE } from "@/lib/site";
import { Logo } from "./components/ui";

export const metadata: Metadata = {
  title: { default: `${SITE.name} — Blend pool risk monitor`, template: `%s · ${SITE.name}` },
  description: SITE.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              <Logo /> {SITE.name}
            </Link>
            <nav className="links" aria-label="Main">
              <Link href="/pools">Pools</Link>
              <Link href="/stats">Stats</Link>
              <Link href="/alerts">Alerts</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/api-docs">API</Link>
            </nav>
            <Link href="/alerts" className="btn" style={{ padding: "8px 18px", fontSize: 14 }}>Get alerts</Link>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            {SITE.name} is an independent, open-source (MIT) monitor. It reads public Stellar data and never moves funds or
            liquidates positions. It is not affiliated with Blend, Script3 or the Stellar Development Foundation. Nothing
            here is financial advice.
            {SITE.repoUrl && (
              <>
                {" "}· <a href={SITE.repoUrl}>Source code</a>
              </>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
