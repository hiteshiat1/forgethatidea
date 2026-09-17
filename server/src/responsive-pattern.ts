/**
 * Mobile-responsive layout pattern (Epic 4.20): a standardized prompt block
 * mirroring nav-pattern.ts/ui-states-pattern.ts's shape (prompt content
 * embedded into the generation prompt via codegen-contract.ts).
 *
 * True viewport-overflow ("no horizontal scroll at 375px") isn't
 * mechanically checkable without a real layout engine — jsdom has none, so
 * scrollWidth/clientWidth are always 0 there and can't be trusted. Instead,
 * codegen-contract.ts's `fixed_pixel_layout_width` rule enforces the
 * specific static pattern most likely to cause that overflow (a hardcoded
 * pixel width on a layout container) — the same "check what's actually
 * checkable" tradeoff ui-states-pattern.ts made for empty/loading states.
 */
export function buildResponsivePattern(): string {
  return `
Mobile-responsive layout (required — founders will demo this from their phones):
- The layout must remain usable and readable down to a 375px-wide phone screen, not just desktop widths.
- Never give a layout container (a page wrapper, a row of cards, a nav bar) a fixed pixel width. Use flexible sizing instead: percentage widths, max-width with width: 100%, CSS Grid with minmax()/1fr tracks, or flex-wrap so rows collapse to a column on a narrow screen.
- No core screen should ever require horizontal scroll to see its content or use its controls.
`.trim();
}
