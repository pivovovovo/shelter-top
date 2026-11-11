import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'inner';
  borderAccent?: 'amber' | 'red' | 'green' | 'purple' | 'gold';
}

const borderColors = {
  amber: 'border-bunker-amber/40',
  red: 'border-bunker-red/40',
  green: 'border-bunker-green/40',
  purple: 'border-bunker-purple/40',
  gold: 'border-bunker-gold/40',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  borderAccent,
  className,
  children,
  ...rest
}) => {
  const baseClass = variant === 'default' ? 'card' : 'card-inner';
  const accentClass = borderAccent ? `border-2 ${borderColors[borderAccent]}` : '';

  return (
    <div {...rest} className={clsx(baseClass, accentClass, className)}>
      {children}
    </div>
  );
};