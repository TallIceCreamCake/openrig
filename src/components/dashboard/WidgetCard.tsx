import React from 'react';

interface WidgetCardProps {
  /** Kept for caller compatibility — the grid header already displays the
   *  widget title, so it is intentionally not rendered here anymore. */
  title?: string;
  children: React.ReactNode;
}

const WidgetCard: React.FC<WidgetCardProps> = ({ children }) => {
  return (
    <div className="h-full p-4 overflow-y-auto">
      {children}
    </div>
  );
};

export default WidgetCard;
