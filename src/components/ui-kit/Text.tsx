import React from 'react';
import { cn } from '../../utils/cn';

type TextVariant = 'title' | 'subtitle' | 'body' | 'label' | 'muted';

type TextProps = React.HTMLAttributes<HTMLElement> & {
  as?: keyof JSX.IntrinsicElements;
  variant?: TextVariant;
};

const variantClasses: Record<TextVariant, string> = {
  title: 'text-lg font-semibold text-slate-900',
  subtitle: 'text-base font-medium text-slate-900',
  body: 'text-sm text-slate-900',
  label: 'text-sm font-medium text-slate-700',
  muted: 'text-xs text-slate-500',
};

const Text: React.FC<TextProps> = ({ as = 'span', variant = 'body', className, ...props }) => {
  const Component = as as keyof JSX.IntrinsicElements;
  return <Component className={cn(variantClasses[variant], className)} {...props} />;
};

export default Text;
