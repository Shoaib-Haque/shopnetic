'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import { cn } from '../lib/cn';

type SwitchOwnProps = ComponentPropsWithoutRef<typeof RSwitch.Root>;

/**
 * A `Switch` never has its own visible text (it's a bare toggle), so it
 * needs *something* to give it an accessible name. Every usage must say
 * which: `aria-label`/`aria-labelledby` directly, or `wrappedInLabel` to
 * assert the caller wraps it in a real `<label>` instead (both current
 * usages' pattern — see the component doc comment below). A future
 * bare/icon-only `<Switch>` that supplies none of the three fails to
 * compile rather than shipping silently inaccessible.
 */
export type SwitchProps = SwitchOwnProps &
  ({ 'aria-label': string } | { 'aria-labelledby': string } | { wrappedInLabel: true });

/**
 * On/off switch wrapper over Radix (plan/CODING-RULES.md D1) — for a single
 * boolean flag that isn't part of a longer list the way `Checkbox` is (e.g.
 * "Restricted", "Active"). Renders a real `<button role="switch">`, which is
 * an HTML "labelable" element like `<input>`/`<button>` — wrapping it (or a
 * sibling label with matching `id`) in a plain `<label>` toggles it on a
 * label click for free, no extra wiring needed.
 */
export const Switch = forwardRef<ElementRef<typeof RSwitch.Root>, SwitchProps>(
  function Switch(props, ref) {
    // `wrappedInLabel` is caller-facing only (a compile-time assertion, see
    // the type above) — never a real DOM attribute, so it's never forwarded.
    const {
      className,
      wrappedInLabel: _wrappedInLabel,
      ...rest
    } = props as SwitchOwnProps & {
      className?: string;
      wrappedInLabel?: true;
    };
    return (
      <RSwitch.Root
        ref={ref}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=unchecked]:bg-muted data-[state=checked]:bg-primary',
          className,
        )}
        {...rest}
      >
        <RSwitch.Thumb
          className={cn(
            'pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
            'data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-[1.125rem]',
          )}
        />
      </RSwitch.Root>
    );
  },
);
