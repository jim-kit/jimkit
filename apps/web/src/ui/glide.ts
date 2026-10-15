/*
 * A change that moves things around the home screen (grouping small categories, two columns wide, Reset) should not make them jump.
 * `glide` measures every arranged category and tool, lets the change happen, then slides each one from where it was to where it is
 * now (FLIP). Items only carry `data-sort-item` and `data-id` while arranging, which is when these controls are on screen.
 */

const MS = 420;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const items = () => document.querySelectorAll<HTMLElement>("[data-sort-item][data-id]");
const keyOf = (el: HTMLElement) => `${el.dataset.sortItem}|${el.dataset.id}`;

export function glide(run: () => void) {
  if (typeof document === "undefined") return run();
  const before = new Map<string, DOMRect>();
  for (const el of items()) before.set(keyOf(el), el.getBoundingClientRect()); // an item still mid-glide starts from where it visibly is
  run();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moves: Array<[HTMLElement, number, number]> = [];
  for (const el of items()) {
    const from = before.get(keyOf(el));
    if (!from) continue;
    for (const a of el.getAnimations()) a.cancel();
    moves.push([el, from.left, from.top]);
  }
  // measure everything first, then start: starting an animation changes nothing a later measurement depends on, but this keeps it obvious
  for (const [el, left, top] of moves) {
    const to = el.getBoundingClientRect();
    const dx = left - to.left, dy = top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: MS, easing: EASE });
  }
}
