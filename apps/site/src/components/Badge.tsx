/** A circle of text that turns slowly, with the mark in the middle. A sticker. */
export function Badge({ className = "" }: { className?: string }) {
  const text = "OPEN SOURCE · AGPL-3.0 · SELF-HOSTED · DOCKER · PROXMOX · ";
  return (
    <svg viewBox="0 0 200 200" className={`badge ${className}`} role="img" aria-label="Open source, AGPL-3.0, self-hosted">
      <defs><path id="badge-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" /></defs>
      <g className="badge-turn"><text fill="currentColor" fontSize="15.5" letterSpacing="3.4" fontFamily="var(--font-mono)"><textPath href="#badge-circle">{text}</textPath></text></g>
      <circle cx="100" cy="100" r="46" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M100 66 L129 83 V117 L100 134 L71 117 V83 Z" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinejoin="round" />
      <text x="100" y="111" textAnchor="middle" fill="var(--color-accent)" fontSize="30" fontWeight="800" fontFamily="var(--font-display)">J</text>
    </svg>
  );
}
