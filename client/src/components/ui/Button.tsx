import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'danger' | 'success' | 'ghost' | 'gold' | 'purple';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  danger: 'btn-danger',
  success: 'btn-success',
  ghost: 'btn-ghost',
  gold: 'btn-gold',
  purple: 'btn-purple',
};

const sizeClass: Record<Size, string> = {
  sm: 'text-xs px-3 min-h-[38px]',
  md: 'text-sm',
  lg: 'text-base min-h-[52px] px-6',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  className,
  disabled,
  children,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={clsx(variantClass[variant], sizeClass[size], fullWidth && 'w-full', className)}
  >
    {loading ? (
      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
    ) : (
      children
    )}
  </button>
);