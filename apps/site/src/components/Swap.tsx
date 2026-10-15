"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Content that changes with a tab: the new content slides in from the side the tab is on, and the box eases to its new height instead of
 * jumping. `order` is the tab order, so moving right slides in from the right and moving left from the left.
 */
export function Swap({ value, order, children }: { value: string; order: readonly string[]; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const previous = useRef(value);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const dir = order.indexOf(value) >= order.indexOf(previous.current) ? 1 : -1;

  useLayoutEffect(() => {
    previous.current = value;
  }, [value]);

  // the box follows the height of what is inside it
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="swap-box" style={{ height }}>
      <div ref={inner}>
        <div key={value} className="swap-in" style={{ ["--dir" as string]: dir }}>{children}</div>
      </div>
    </div>
  );
}
