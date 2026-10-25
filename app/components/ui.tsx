import Link from "next/link";
import type { ReactNode } from "react";
import type { NetworkName } from "@/lib/config";
import type { Severity } from "@/lib/types";
import { UNAVAILABLE } from "@/lib/format";

export function Logo({ size = 22 }: { size?: number }) {
  // Original mark: a hull outline over a level line.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12l2.5 6h9L19 12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 12V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function NetworkBadge({ network }: { network: NetworkName }) {
  return <span className={`badge ${network}`}>{network === "mainnet" ? "● Mainnet" : "◆ Testnet"}</span>;
}

export function NetworkSwitch({ network, path }: { network: NetworkName; path: string }) {
  return (
    <span className="netswitch" role="group" aria-label="Network">
      <a className={network === "mainnet" ? "on" : ""} href={`${path}?network=mainnet`}>Mainnet</a>
      <a className={network === "testnet" ? "on" : ""} href={`${path}?network=testnet`}>Testnet</a>
    </span>
  );
}

export function PageHead({ title, network, path, children }: { title: string; network?: NetworkName; path?: string; children?: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <h1 style={{ margin: 0 }}>{title}</h1>
          {network && <NetworkBadge network={network} />}
        </div>
        {network && path && <NetworkSwitch network={network} path={path} />}
      </div>
      {children && <div className="muted" style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

export function Val({ v }: { v: string }) {
  return v === UNAVAILABLE ? <span className="na">unavailable</span> : <>{v}</>;
}

export function Pill({ s, children }: { s: Severity | "resolved"; children?: ReactNode }) {
  return <span className={`pill ${s}`}>{children ?? s}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value"><Val v={value} /></div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function ErrorNotice({ error }: { error: string }) {
  return (
    <div className="notice err">
      <strong>Live data unavailable.</strong> The Stellar RPC or a price source could not be reached, so nothing is shown
      instead of guessing. <span className="mono small">{error}</span>
    </div>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href}>{children}</Link>;
}
