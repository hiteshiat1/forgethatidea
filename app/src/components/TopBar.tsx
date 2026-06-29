import { type ReactNode } from 'react';
import { BrandLockup } from './BrandLockup.js';

export interface TopBarProps {
  /** Phase rail slot — the rail component lands in Epic 1.3 (#15). */
  rail?: ReactNode;
  /** Right-aligned slot for status indicators (Epic 1.11). */
  aside?: ReactNode;
}

/** Shell top bar: brand lockup on the left, phase rail centered, status aside. */
export function TopBar({ rail, aside }: TopBarProps) {
  return (
    <header className="shell-topbar">
      <BrandLockup />
      <div className="shell-topbar__rail">{rail}</div>
      <div className="shell-topbar__aside">{aside}</div>
    </header>
  );
}
