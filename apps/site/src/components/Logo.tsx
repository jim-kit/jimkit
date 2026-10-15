/** The Jimkit mark, as in the app (apps/web/src/ui/logo.tsx): the accent colour, a little lighter (.jk-logo). */
const MARK =
  "M560,56 L772,190 L560,326Z M560,56 L560,326 L348,190Z M292,226 L498,356 L292,486 L86,356Z M86,356 L292,486 L292,744 L86,614Z M826,226 L1037,356 L826,484Z M826,484 L1037,356 L1037,614Z M86,684 L294,813 L86,942Z M294,813 L86,942 L294,1072Z M826,548 L1037,678 L1037,942 L826,812Z M615,942 L826,812 L1037,942 L826,1072Z M348,849 L561,980 L561,1232 L348,1101Z M561,980 L774,1105 L561,1232Z M562,390 L671,325 L671,719 L562,786Z M671,325 L770,265 L770,778 L671,719Z M562,786 L671,719 L770,778 L562,910Z M346,775 L452,716 L562,786 L562,910Z M346,520 L452,584 L452,716 L346,775Z M452,584 L452,716 L556,650Z";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="jk-logo" width={size} height={size} viewBox="-39 44 1200 1200" role="img" aria-label="Jimkit" style={{ flexShrink: 0 }}>
      <path d={MARK} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}
