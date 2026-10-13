import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import "./App.css";

import Navibar from "./components/NaviBar";
import { SessionProvider, useSession } from "./context/SessionContext";
import BookingsPage from "./pages/BookingsPage";
import MapPage from "./pages/MapPage";
import MonitorPage from "./pages/MonitorPage";
import NotFoundPage from "./pages/NotFoundPage";
import SchedulePage from "./pages/SchedulePage";
import VenuePage from "./pages/VenuePage";
import AdminPage from "./pages/admin/AdminPage";
import AdminLogsPage from "./pages/admin/AdminLogsPage";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminSectionPage from "./pages/admin/AdminSectionPage";

// Hides the admin pages from non-admins; the backend refuses their admin requests anyway.
const RequireAdminAccess = () => {
  const { isAdmin, isLoading } = useSession();

  if (isLoading) {
    return null;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
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
          <Route path="/targets" element={<Navigate to="/" replace />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/venue" element={<VenuePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/settings" element={<Navigate to="/" replace />} />
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
              <Route path="logs" element={<AdminLogsPage />} />
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
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

export default App;
