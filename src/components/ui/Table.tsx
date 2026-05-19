import React from 'react';
import { cn } from '../../utils/cn';

type TableProps = React.TableHTMLAttributes<HTMLTableElement>;

type TableSectionProps<T extends HTMLElement> = React.HTMLAttributes<T> & {
  as?: React.ElementType;
};

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

type TableHeaderCellProps = React.ThHTMLAttributes<HTMLTableHeaderCellElement>;

export const Table: React.FC<TableProps> = ({ className, children, ...props }) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('min-w-full divide-y divide-slate-200', className)} {...props}>
      {children}
    </table>
  </div>
);

export const TableHead: React.FC<TableSectionProps<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <thead className={cn('bg-slate-50', className)} {...props}>
    {children}
  </thead>
);

export const TableBody: React.FC<TableSectionProps<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <tbody className={cn('bg-white divide-y divide-slate-200', className)} {...props}>
    {children}
  </tbody>
);

export const TableRow: React.FC<TableSectionProps<HTMLTableRowElement>> = ({ className, children, ...props }) => (
  <tr className={cn('', className)} {...props}>
    {children}
  </tr>
);

export const TableHeaderCell: React.FC<TableHeaderCellProps> = ({ className, children, ...props }) => (
  <th
    className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500', className)}
    {...props}
  >
    {children}
  </th>
);

export const TableCell: React.FC<TableCellProps> = ({ className, children, ...props }) => (
  <td className={cn('px-4 py-3 text-sm text-slate-700', className)} {...props}>
    {children}
  </td>
);
