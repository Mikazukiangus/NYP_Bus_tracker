import type { ComponentProps } from 'react';

type ActionButtonProps = ComponentProps<'button'> & { tone?: 'primary' | 'secondary' | 'quiet' };

// Shared target, feedback and focus behavior; native button semantics carry through.
export function ActionButton({ tone = 'secondary', className = '', type = 'button', ...props }: ActionButtonProps) {
  return <button {...props} type={type} className={`action-button action-button-${tone} ${className}`} />;
}

export function IconButton({ label, className = '', ...props }: ActionButtonProps & { label: string }) {
  return <ActionButton {...props} aria-label={label} className={`icon-button ${className}`} />;
}
