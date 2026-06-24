import React from 'react';
import MobileTopBar from './MobileTopBar';
import MobileBottomNav from './MobileBottomNav';

const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <MobileTopBar />
      <div className="px-4 pt-4 pb-24">
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default MobileLayout;
