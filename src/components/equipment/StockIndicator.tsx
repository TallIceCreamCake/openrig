import React from 'react';
import { Tooltip } from '../ui/Tooltip';

interface StockIndicatorProps {
  totalStock: number;
  status: string;
}

const StockIndicator: React.FC<StockIndicatorProps> = ({ totalStock, status }) => {
  const getColor = () => {
    if (status !== 'available') return 'bg-gray-300';
    if (totalStock === 0) return 'bg-red-500';
    if (totalStock < 3) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Tooltip content={`${totalStock} units in stock`}>
      <div className={`w-3 h-3 rounded-full ${getColor()} cursor-help`} />
    </Tooltip>
  );
}

export default StockIndicator;