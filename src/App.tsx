import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { AuthProvider, isStaff, useAuth } from './lib/auth';
import Login from './screens/Login';
import Signup from './screens/Signup';
import ForgotPassword from './screens/ForgotPassword';
import Home from './screens/Home';
import Earn from './screens/Earn';
import Prize from './screens/Prize';
import Ranks from './screens/Ranks';
import Me from './screens/Me';
import Notifications from './screens/Notifications';
import Rules from './screens/Rules';
import AdminLayout from './screens/admin/AdminLayout';
import AdminHome from './screens/admin/AdminHome';
import Review from './screens/admin/Review';
import Players from './screens/admin/Players';
import Events from './screens/admin/Events';
import Prizes from './screens/admin/Prizes';
import System from './screens/admin/System';

function RequireAuth() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="app-shell"><Loading /></div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireStaff({ chairOnly = false }: { chairOnly?: boolean }) {
  const { user } = useAuth();
  if (!isStaff(user) || (chairOnly && user!.role !== 'chair')) return <Navigate to="/" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        {/* HashRouter so deep links work on GitHub Pages without server rewrites. */}
        <HashRouter>
          <Routes>
            <Route element={<PublicOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot" element={<ForgotPassword />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="earn" element={<Earn />} />
                <Route path="prize" element={<Prize />} />
                <Route path="ranks" element={<Ranks />} />
                <Route path="me" element={<Me />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="rules" element={<Rules />} />
                <Route path="admin" element={<RequireStaff />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<AdminHome />} />
                    <Route path="review" element={<Review />} />
                    <Route path="players" element={<Players />} />
                    <Route path="events" element={<Events />} />
                    <Route element={<RequireStaff chairOnly />}>
                      <Route path="prizes" element={<Prizes />} />
                      <Route path="system" element={<System />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
