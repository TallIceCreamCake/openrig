import React from 'react';
import MobileLayout from './MobileLayout';
import MobileMenu from './MobileMenu';

const MobileHome: React.FC = () => {
  return (
    <MobileLayout>
      <MobileMenu />
    </MobileLayout>
  );
};

export default MobileHome;

