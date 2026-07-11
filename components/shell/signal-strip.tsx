/**
 * Signal strip — the signature element of the app.
 *
 * 32px tall, pinned under the top bar, always visible. Real equity-curve
 * micro-sparkline comes in Phase 5; for now a static flat line holds the
 * layout and establishes the visual rhythm.
 */
export function SignalStrip() {
  return (
    <div className="border-hairline bg-base flex h-8 items-center justify-between border-b px-6">
      <span className="num text-tertiary text-[10px] uppercase tracking-wide">
        Equity curve
      </span>
      {/* Flat line placeholder — replaced by live sparkline in Phase 5. */}
      <svg
        className="text-hairline absolute left-0 h-8 w-full px-6"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="num text-secondary relative z-10 text-[10px]">
        —
      </span>
    </div>
  );
}
