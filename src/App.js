import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import "./App.css";

import Navibar from "./components/NaviBar";
import { AppSettingsProvider, useAppSettings } from "./context/AppSettingsContext";
import BookingsPage from "./pages/BookingsPage";
import MapPage from "./pages/MapPage";
import NotFoundPage from "./pages/NotFoundPage";
import SchedulePage from "./pages/SchedulePage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/admin/AdminPage";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminSectionPage from "./pages/admin/AdminSectionPage";

const RequireAdminAccess = () => {
  const location = useLocation();
  const { hasAdminAccess } = useAppSettings();

  if (!hasAdminAccess) {
    return (
      <Navigate
        to="/settings"
        replace
        state={{ redirectTo: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
};

const AppShell = () => {
  return (
    <div className="app-shell">
      <Navibar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<BookingsPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route element={<RequireAdminAccess />}>
            <Route path="/admin" element={<AdminPage />}>
              <Route index element={<AdminOverviewPage />} />
              <Route
                path="schedule"
                element={<AdminSectionPage sectionKey="schedule" />}
              />
              <Route
                path="venues"
                element={<AdminSectionPage sectionKey="venues" />}
              />
              <Route
                path="bookings"
                element={<AdminSectionPage sectionKey="bookings" />}
              />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <AppSettingsProvider>
      <AppShell />
    </AppSettingsProvider>
  );
}

export default App;
