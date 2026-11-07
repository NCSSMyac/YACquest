import { CelebrateProvider } from './lib/celebrate';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading, ToastProvider, useToast } from './components/ui';
import { AuthProvider, isStaff, useAuth } from './lib/auth';
import Login from './screens/Login';
import Signup from './screens/Signup';
import ForgotPassword from './screens/ForgotPassword';
import CheckEmail from './screens/CheckEmail';
import ResetPassword from './screens/ResetPassword';
import Home from './screens/Home';
import Earn from './screens/Earn';
import Prize from './screens/Prize';
import Ranks from './screens/Ranks';
import Me from './screens/Me';
import Notifications from './screens/Notifications';
import Rules from './screens/Rules';
import Help from './screens/Help';
import CheckInLink from './screens/CheckInLink';
import { takePendingCheckIn } from './lib/pendingCheckin';
import AdminLayout from './screens/admin/AdminLayout';
import AdminHome from './screens/admin/AdminHome';
import Review from './screens/admin/Review';
import Players from './screens/admin/Players';
import Events from './screens/admin/Events';
import Prizes from './screens/admin/Prizes';
import System from './screens/admin/System';
import Team from './screens/admin/Team';
import Announce from './screens/admin/Announce';
import Feedback from './screens/admin/Feedback';
import ActivityLog from './screens/admin/ActivityLog';
import Heroes from './screens/admin/Heroes';
import Council from './screens/admin/Council';

// 0025: lazy-loaded so the charts and the full-screen door view stay out of the main bundle.
const Stats = lazy(() => import('./screens/admin/Stats'));
const DoorMode = lazy(() => import('./screens/admin/DoorMode'));
const lazyPage = (el: JSX.Element) => <Suspense fallback={<Loading lines={3} />}>{el}</Suspense>;

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

/**
 * Email links come back as `<site>?confirmed=1` or `<site>?reset=1` (query string, because
 * the app uses HashRouter). Read the query once at startup — before anything cleans it —
 * then act once the session is known, and tidy the address bar.
 */
const initialQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

function EmailLinkRedirects() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    const reset = initialQuery.get('reset') === '1';
    const confirmed = initialQuery.get('confirmed') === '1';
    const linkError = initialQuery.get('error_description');
    if (!reset && !confirmed && !linkError) return;
    done.current = true;
    if (linkError) {
      toast(`That link didn’t work: ${linkError}. Please request a new one.`, 'error');
      nav(reset ? '/forgot' : '/login', { replace: true });
    } else if (reset) {
      if (user) nav('/reset-password', { replace: true });
      else {
        toast('That reset link expired or was opened in another browser. Request a new one here.', 'error');
        nav('/forgot', { replace: true });
      }
    } else if (confirmed) {
      // If the link was opened in a different browser, the email is confirmed but there's no session here.
      toast(user ? 'Email confirmed — welcome!' : 'Email confirmed — log in to start your quest!', 'success');
      nav(user ? '/' : '/login', { replace: true });
    }
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
  }, [ready, user, nav, toast]);
  return null;
}

/**
 * A check-in QR scanned while logged out is remembered (src/lib/pendingCheckin.ts). As soon as
 * someone is logged in — after Login, Signup, or the ?confirmed=1 link — finish it once by
 * sending them to #/checkin. Waits while a password-reset link is being handled.
 */
function PendingCheckInRedirect() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const resetPending = useRef(initialQuery.get('reset') === '1' && !initialQuery.get('error_description'));
  useEffect(() => {
    if (!ready || !user) return;
    if (pathname === '/reset-password') {
      resetPending.current = false;
      return;
    }
    // Login/Signup navigate to Home themselves right after logging in: wait until we're there.
    if (resetPending.current || ['/checkin', '/login', '/signup', '/forgot', '/check-email'].includes(pathname)) return;
    const p = takePendingCheckIn();
    if (!p) return;
    const q = new URLSearchParams({ event: p.eventId, code: p.code });
    if (p.title) q.set('title', p.title);
    nav(`/checkin?${q.toString()}`, { replace: true });
  }, [ready, user, pathname, nav]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CelebrateProvider>
        {/* HashRouter so deep links work on GitHub Pages without server rewrites. */}
        <HashRouter>
          <EmailLinkRedirects />
          <PendingCheckInRedirect />
          <Routes>
            <Route element={<PublicOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot" element={<ForgotPassword />} />
              <Route path="/check-email" element={<CheckEmail />} />
            </Route>
            <Route path="/help" element={<Help />} />
            {/* Event QR codes open this; it handles logged-in and logged-out visitors itself. */}
            <Route path="/checkin" element={<CheckInLink />} />
            <Route element={<RequireAuth />}>
              {/* Outside Layout: the reset link logs the person in, then they pick a new password here. */}
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* 0025: Event-day Door mode is full screen (no app header / tab bar). Staff only. */}
              <Route element={<RequireStaff />}>
                <Route path="/admin/door/:eventId" element={<Suspense fallback={<div className="app-shell"><Loading /></div>}><DoorMode /></Suspense>} />
              </Route>
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
                    <Route path="council" element={<Council />} />
                    <Route path="review" element={<Review />} />
                    <Route path="announce" element={<Announce />} />
                    <Route path="feedback" element={<Feedback />} />
                    <Route path="players" element={<Players />} />
                    <Route path="events" element={<Events />} />
                    <Route path="stats" element={lazyPage(<Stats />)} />
                    <Route element={<RequireStaff chairOnly />}>
                      <Route path="prizes" element={<Prizes />} />
                      <Route path="system" element={<System />} />
                      <Route path="team" element={<Team />} />
                      <Route path="heroes" element={<Heroes />} />
                      <Route path="log" element={<ActivityLog />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
        </CelebrateProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
