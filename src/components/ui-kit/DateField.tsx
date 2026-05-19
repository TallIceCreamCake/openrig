import React from 'react';
import DatePicker from '../ui/DatePicker';
import { cn } from '../../utils/cn';

type DateFieldProps = React.ComponentProps<typeof DatePicker> & {
  className?: string;
};

const DateField: React.FC<DateFieldProps> = ({ className, ...props }) => {
  return (
    <div className={cn('space-y-2', className)}>
      <DatePicker {...props} />
    </div>
  );
};

export default DateField;
