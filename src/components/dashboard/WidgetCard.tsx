import React from 'react';

interface WidgetCardProps {
  title: string;
  children: React.ReactNode;
}

const WidgetCard: React.FC<WidgetCardProps> = ({ title, children }) => {
  return (
    <div className="h-full p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
};

export default WidgetCard;