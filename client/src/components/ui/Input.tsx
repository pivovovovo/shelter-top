
import React, { forwardRef } from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...rest }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-bold uppercase tracking-wider text-bunker-muted mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full px-4 py-3 bg-bunker-surface2 border rounded-xl text-base transition-colors',
            'focus:border-bunker-amber focus:ring-1 focus:ring-bunker-amber outline-none',
            'placeholder:text-bunker-muted/50 text-bunker-text',
            error ? 'border-bunker-red' : 'border-bunker-border',
            className
          )}
          {...rest}
        />
        {error && <p className="mt-1 text-xs text-bunker-red">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';