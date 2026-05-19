import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import Equipment from './pages/Equipment';
import EquipmentDetail from './pages/EquipmentDetail';
import Rentals from './pages/Rentals';
import RentalDetail from './pages/RentalDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Services from './pages/Services';
import ServiceDetail from './pages/ServiceDetail';
import Warehouses from './pages/Warehouses';
import WarehouseDetail from './pages/WarehouseDetail';
import Calendar from './pages/Calendar';
import Personnel from './pages/Personnel';
import PersonnelDetail from './pages/PersonnelDetail';
import Accounting from './pages/Accounting';
import Maintenance from './pages/Maintenance';
import MaintenanceDetail from './pages/MaintenanceDetail';
import SettingsPage from './pages/Settings';
import CompanySettingsPage from './pages/CompanySettings';
import TemplateStudio from './pages/TemplateStudio';
import PersonnelChatPage from './pages/PersonnelChatPage';
import LoginPage from './pages/Login';
import FirstLoginPage from './pages/FirstLogin';
import SystemSetupPage from './pages/SystemSetup';
import SetupDatabasePage from './pages/SetupDatabase';
import DossierShare from './pages/DossierShare';
import { AuthProvider, useAuth } from './context/AuthContext';
import Vehicles from './pages/Vehicles';
import VehicleDetail from './pages/VehicleDetail';
import BillingPage from './pages/Billing';
import BillingCreatePage from './pages/BillingCreate';
import BillingDetailPage from './pages/BillingDetail';
import MobileHome from './pages/mobile/MobileHome';
import MobilePreparations from './pages/mobile/MobilePreparations';
import MobileDeliveries from './pages/mobile/MobileDeliveries';
import MobilePrestations from './pages/mobile/MobilePrestations';
import MobileAccount from './pages/mobile/MobileAccount';
import MobilePreparationDetail from './pages/mobile/MobilePreparationDetail';
import MobileDeliveryDetail from './pages/mobile/MobileDeliveryDetail';
import MobilePrestationDetail from './pages/mobile/MobilePrestationDetail';
import MobileCalendar from './pages/mobile/MobileCalendar';
import MobileReturns from './pages/mobile/MobileReturns';
import MobileReturnDetail from './pages/mobile/MobileReturnDetail';
import MobileCompany from './pages/mobile/MobileCompany';
import MobileWarehouses from './pages/mobile/MobileWarehouses';
import MobileWarehouseDetail from './pages/mobile/MobileWarehouseDetail';
import MobileClients from './pages/mobile/MobileClients';
import MobileClientDetail from './pages/mobile/MobileClientDetail';
import MobileEquipment from './pages/mobile/MobileEquipment';
import MobileEquipmentDetail from './pages/mobile/MobileEquipmentDetail';
import MobileAccessoryDetail from './pages/mobile/MobileAccessoryDetail';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { DatabaseStatusProvider, DatabaseOfflineOverlay } from './context/DatabaseStatusContext';
import { TranslationProvider, useTranslation } from './context/TranslationContext';
import DepotLayout from './pages/depot/DepotLayout';
import DepotHome from './pages/depot/DepotHome';
import { getPreferredInterfaceMode, resolvePostLoginPath } from './utils/interfaceMode';

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const preferredInterfaceMode = getPreferredInterfaceMode();
  const homePath = resolvePostLoginPath(false, preferredInterfaceMode);
  if (loading) return <div className="h-screen w-screen flex items-center justify-center text-gray-600">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== '/first-login') {
    return <Navigate to="/first-login" replace />;
  }
  if (!user.must_change_password && location.pathname === '/first-login') {
    return <Navigate to={homePath} replace />;
  }
  return <>{children}</>;
};

const TitleUpdater: React.FC = () => {
  const location = useLocation();
  useDocumentTitle(location.pathname);
  return null;
};

const DepotShell: React.FC = () => (
  <DepotLayout>
    <TitleUpdater />
    <Outlet />
  </DepotLayout>
);

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DatabaseStatusProvider>
        <TranslationProvider>
          <AuthProvider>
            <Toaster position="top-right" />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/share/dossier/:token" element={<DossierShare />} />
              <Route
                path="/first-login"
                element={
                  <RequireAuth>
                    <FirstLoginPage />
                  </RequireAuth>
                }
              />
              <Route path="/setup" element={<SystemSetupPage />} />
              <Route path="/setup/database" element={<SetupDatabasePage />} />
              <Route
                path="/depot"
                element={
                  <RequireAuth>
                    <DepotShell />
                  </RequireAuth>
                }
              >
                <Route index element={<DepotHome />} />
                <Route path="*" element={<Navigate to="/depot" replace />} />
              </Route>
              <Route
                path="/*"
                element={
                  <RequireAuth>
                    <Layout>
                      <TitleUpdater />
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/equipment" element={<Equipment />} />
                        <Route path="/equipment/:id" element={<EquipmentDetail />} />
                        <Route path="/vehicles" element={<Vehicles />} />
                        <Route path="/vehicles/:id" element={<VehicleDetail />} />
                        <Route path="/rentals" element={<Rentals />} />
                        <Route path="/rentals/:id" element={<RentalDetail />} />
                        <Route path="/services" element={<Services />} />
                        <Route path="/services/:id" element={<ServiceDetail />} />
                        <Route path="/clients" element={<Clients />} />
                        <Route path="/clients/:id" element={<ClientDetail />} />
                        <Route path="/warehouses" element={<Warehouses />} />
                        <Route path="/warehouses/:id" element={<WarehouseDetail />} />
                        <Route path="/calendar" element={<Calendar />} />
                        <Route path="/personnel" element={<Personnel />} />
                        <Route path="/personnel/:id" element={<PersonnelDetail />} />
                        <Route path="/chat" element={<PersonnelChatPage />} />
                        <Route path="/accounting/*" element={<Accounting />}>
                          <Route path="documents" element={<BillingPage />} />
                          <Route path="documents/new" element={<BillingCreatePage />} />
                          <Route path="documents/:id" element={<BillingDetailPage />} />
                        </Route>
                        <Route path="/billing/*" element={<Navigate to="/accounting/documents" replace />} />
                        <Route path="/maintenance" element={<Maintenance />} />
                        <Route path="/maintenance/:id" element={<MaintenanceDetail />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/company" element={<CompanySettingsPage />} />
                        <Route path="/company/template-studio" element={<TemplateStudio />} />
                        {/* Mobile routes */}
                        <Route path="/m" element={<MobileHome />} />
                        <Route path="/m/preparations" element={<MobilePreparations />} />
                        <Route path="/m/livraisons" element={<MobileDeliveries />} />
                        <Route path="/m/prestations" element={<MobilePrestations />} />
                        <Route path="/m/retours" element={<MobileReturns />} />
                        <Route path="/m/calendrier" element={<MobileCalendar />} />
                        <Route path="/m/entreprise" element={<MobileCompany />} />
                        <Route path="/m/entrepots" element={<MobileWarehouses />} />
                        <Route path="/m/clients" element={<MobileClients />} />
                        <Route path="/m/materiel" element={<MobileEquipment />} />
                        <Route path="/m/preparations/:id" element={<MobilePreparationDetail />} />
                        <Route path="/m/livraisons/:id" element={<MobileDeliveryDetail />} />
                        <Route path="/m/prestations/:id" element={<MobilePrestationDetail />} />
                        <Route path="/m/retours/:id" element={<MobileReturnDetail />} />
                        <Route path="/m/entrepots/:id" element={<MobileWarehouseDetail />} />
                        <Route path="/m/clients/:id" element={<MobileClientDetail />} />
                        <Route path="/m/materiel/:id" element={<MobileEquipmentDetail />} />
                        <Route path="/m/accessoires/:id" element={<MobileAccessoryDetail />} />
                        <Route path="/m/account" element={<MobileAccount />} />
                      </Routes>
                    </Layout>
                  </RequireAuth>
                }
              />
            </Routes>
          </AuthProvider>
        </TranslationProvider>
        <DatabaseOfflineOverlay />
      </DatabaseStatusProvider>
    </Router>
  );
}

export default App;
