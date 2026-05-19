import React from 'react';
import { cn } from '../../utils/cn';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label: React.FC<LabelProps> = ({ className, children, ...props }) => {
  return (
    <label className={cn('block text-sm font-medium text-slate-700', className)} {...props}>
      {children}
    </label>
  );
};

export default Label;
