import React from 'react';
import { cn } from '../../utils/cn';
import Label from '../ui/Label';
import Text from './Text';

type FieldProps = {
  id?: string;
  label?: string;
  helper?: React.ReactNode;
  className?: string;
  labelClassName?: string;
  helperClassName?: string;
  children: React.ReactNode;
};

const Field: React.FC<FieldProps> = ({
  id,
  label,
  helper,
  className,
  labelClassName,
  helperClassName,
  children,
}) => {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
      )}
      {children}
      {helper && (
        typeof helper === 'string'
          ? (
            <Text variant="muted" className={helperClassName}>
              {helper}
            </Text>
          )
          : helper
      )}
    </div>
  );
};

export default Field;
