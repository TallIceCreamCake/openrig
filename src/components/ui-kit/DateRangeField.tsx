import React from 'react';
import DateRangePicker from '../ui/DateRangePicker';
import { cn } from '../../utils/cn';

type DateRangeFieldProps = React.ComponentProps<typeof DateRangePicker> & {
  className?: string;
};

const DateRangeField: React.FC<DateRangeFieldProps> = ({ className, ...props }) => {
  return (
    <div className={cn('space-y-2', className)}>
      <DateRangePicker {...props} />
    </div>
  );
};

export default DateRangeField;
