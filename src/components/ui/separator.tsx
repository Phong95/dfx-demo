import * as React from 'react';

import { cn } from '@/lib/utils';

// Hand-built (no @radix-ui/react-separator dependency) -- a purely decorative
// divider between sidebar panels does not need Radix's full orientation/ARIA
// primitive; matches the project's established pattern (Plan 01 hand-built
// button/badge/scroll-area/tooltip when the shadcn CLI couldn't run
// non-interactively) while avoiding an unreviewed new package install.
function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
