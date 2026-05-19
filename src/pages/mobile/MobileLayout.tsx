import React from 'react';
import MobileTopBar from './MobileTopBar';

const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-white">
      <MobileTopBar />
      <div className="px-4 pt-4 pb-6">
        {children}
      </div>
    </div>
  );
};

export default MobileLayout;
