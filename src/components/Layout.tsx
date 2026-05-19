import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import TemplateStudioTopBar from './TemplateStudioTopBar';
import Sidebar from './Sidebar';
import ChatNotificationListener from './personnel/ChatNotificationListener';
import BugReportLauncher from './bug-reports/BugReportLauncher';
import { useAuth } from '../context/AuthContext';
import StepTransition from './ui-kit/StepTransition';
import { TabsProvider } from '../context/TabsContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileRoute = location.pathname === '/m' || location.pathname.startsWith('/m/');
  const isTemplateStudioRoute = location.pathname === '/company/template-studio';

  useEffect(() => {
    // expose logout for Sidebar static handler
    (window as any).__auth_logout = logout;
  }, [logout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
    const isSmallScreen = window.matchMedia?.('(max-width: 900px)')?.matches ?? window.innerWidth <= 900;
    if (!isMobileUa || !isSmallScreen) return;

    const path = location.pathname || '/';
    const allowed =
      path === '/m'
      || path === '/m/preparations'
      || path === '/m/livraisons'
      || path === '/m/retours'
      || path === '/m/prestations'
      || path === '/m/calendrier'
      || path === '/m/entreprise'
      || path === '/m/entrepots'
      || path === '/m/clients'
      || path === '/m/materiel'
      || path === '/m/accessoires'
      || path === '/m/account'
      || path.startsWith('/m/preparations/')
      || path.startsWith('/m/livraisons/')
      || path.startsWith('/m/retours/')
      || path.startsWith('/m/entrepots/')
      || path.startsWith('/m/clients/')
      || path.startsWith('/m/materiel/')
      || path.startsWith('/m/accessoires/')
      || path.startsWith('/m/prestations/');

    if (!allowed) {
      navigate('/m', { replace: true });
    }
  }, [location.pathname, navigate]);

  if (isMobileRoute) {
    return (
      <>
        <ChatNotificationListener />
        <BugReportLauncher />
        <StepTransition stepKey={location.pathname}>
          {children}
        </StepTransition>
      </>
    );
  }

  return (
    <TabsProvider>
    <div className="flex h-screen bg-gray-100 relative">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden md:ml-0">
        <ChatNotificationListener />
        {isTemplateStudioRoute ? <TemplateStudioTopBar /> : <TopBar />}
        <main
          className={
            isTemplateStudioRoute
              ? 'flex flex-1 min-h-0 overflow-hidden bg-gray-100'
              : 'flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 md:p-6 pt-16 md:pt-6'
          }
        >
          <StepTransition
            stepKey={location.pathname}
            className={isTemplateStudioRoute ? 'h-full min-h-0 flex-1' : 'min-h-full'}
          >
            {children}
          </StepTransition>
        </main>
        <BugReportLauncher />
      </div>
    </div>
    </TabsProvider>
  );
};

export default Layout;
