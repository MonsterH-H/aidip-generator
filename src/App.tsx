import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '@/hooks/AuthContext';
import { AuthPage } from '@/components/AuthPage';
import { AuthCallback } from '@/pages/AuthCallback.tsx';

import { RequireAuth, RequireRole, RoleRedirect } from '@/components/aidip/RouteGuards';
import { AidipShell } from '@/components/aidip/AidipShell';

// AIDIP pages — Module 1 (Auth) + Module 4 (Dashboard)
import { AccessDeniedPage } from '@/pages/aidip/AccessDeniedPage';
import { InviteAcceptPage } from '@/pages/aidip/InviteAcceptPage';
import { DashboardPage } from '@/pages/aidip/DashboardPage';

// Module 3 — Chatbot
import { ChatPage } from '@/pages/aidip/ChatPage';
import { ConversationPage } from '@/pages/aidip/ConversationPage';

// Module 5 — Reports
import { ReportsListPage } from '@/pages/aidip/ReportsListPage';
import { ReportEditorPage } from '@/pages/aidip/ReportEditorPage';
import { ReportViewPage } from '@/pages/aidip/ReportViewPage';
import { NewReportPage } from '@/pages/aidip/NewReportPage';

// Module 8 — Notifications
import { NotificationsPage } from '@/pages/aidip/NotificationsPage';

// Profile
import { ProfilePage } from '@/pages/aidip/ProfilePage';

// Help & documentation
import { HelpPage } from '@/pages/aidip/HelpPage';

// 404
import { NotFoundPage } from '@/pages/aidip/NotFoundPage';

// Module 7 — Team Management & Analytics (Admin)
import { AdminTeamPage } from '@/pages/aidip/AdminTeamPage';
import { AdminTeamMemberPage } from '@/pages/aidip/AdminTeamMemberPage';
import { AdminAnalyticsPage } from '@/pages/aidip/AdminAnalyticsPage';
import { AdminSettingsPage } from '@/pages/aidip/AdminSettingsPage';

// Module 11 — Super Admin Back-Office
import { SuperAdminDashboardPage } from '@/pages/aidip/SuperAdminDashboardPage';
import { SuperAdminCompaniesPage } from '@/pages/aidip/SuperAdminCompaniesPage';
import { SuperAdminCompanyDetailPage } from '@/pages/aidip/SuperAdminCompanyDetailPage';
import { SuperAdminNewCompanyPage } from '@/pages/aidip/SuperAdminNewCompanyPage';
import { SuperAdminMonitoringPage } from '@/pages/aidip/SuperAdminMonitoringPage';

/**
 * PublicRoute — redirects authenticated users away from /auth.
 * Preserved from the original scaffold (auth flow is unchanged).
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/**
 * App routing table — AIDIP v3.0 MVP per CDC §4–§14.
 *
 * Route guards:
 *   - RequireAuth: any authenticated user (analyst / admin / super_admin)
 *   - RequireRole: restricted to specific roles (used for /admin/* and /super-admin/*)
 *
 * All authenticated routes are wrapped in <AidipShell> which provides the
 * role-aware sidebar + header + global search + notifications panel.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ==================== Auth & onboarding ==================== */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <AuthPage />
            </PublicRoute>
          }
        />
        <Route path="/invite/accept" element={<InviteAcceptPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />

        {/* ==================== Root redirect ==================== */}
        <Route path="/" element={<RoleRedirect />} />

        {/* ==================== Profile setup (first login) ====================
            Note: AIDIP does not require profile setup — roles come from the
            invitation flow. Route kept as alias to /dashboard for any deep
            links from older sessions. */}
        <Route path="/profile-setup" element={<Navigate to="/dashboard" replace />} />

        {/* ==================== Analyst + Admin routes ==================== */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <AidipShell>
                <DashboardPage />
              </AidipShell>
            </RequireAuth>
          }
        />

        {/* Module 3 — Chatbot */}
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <AidipShell>
                <ChatPage />
              </AidipShell>
            </RequireAuth>
          }
        />
        <Route
          path="/chat/:conversationId"
          element={
            <RequireAuth>
              <AidipShell>
                <ConversationPage />
              </AidipShell>
            </RequireAuth>
          }
        />

        {/* Module 5 — Reports */}
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <AidipShell>
                <ReportsListPage />
              </AidipShell>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/new"
          element={
            <RequireAuth>
              <AidipShell>
                <NewReportPage />
              </AidipShell>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:reportId"
          element={
            <RequireAuth>
              <AidipShell>
                <ReportViewPage />
              </AidipShell>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:reportId/edit"
          element={
            <RequireAuth>
              <AidipShell>
                <ReportEditorPage />
              </AidipShell>
            </RequireAuth>
          }
        />

        {/* Module 8 — Notifications */}
        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <AidipShell>
                <NotificationsPage />
              </AidipShell>
            </RequireAuth>
          }
        />

        {/* Profile */}
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <AidipShell>
                <ProfilePage />
              </AidipShell>
            </RequireAuth>
          }
        />

        {/* Help & documentation */}
        <Route
          path="/help"
          element={
            <RequireAuth>
              <AidipShell>
                <HelpPage />
              </AidipShell>
            </RequireAuth>
          }
        />

        {/* ==================== Admin-only routes ==================== */}
        <Route
          path="/admin/team"
          element={
            <RequireRole allowed={['admin', 'super_admin']}>
              <AidipShell>
                <AdminTeamPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/admin/team/:userId"
          element={
            <RequireRole allowed={['admin', 'super_admin']}>
              <AidipShell>
                <AdminTeamMemberPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <RequireRole allowed={['admin', 'super_admin']}>
              <AidipShell>
                <AdminAnalyticsPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireRole allowed={['admin', 'super_admin']}>
              <AidipShell>
                <AdminSettingsPage />
              </AidipShell>
            </RequireRole>
          }
        />

        {/* ==================== Super Admin routes ==================== */}
        <Route
          path="/super-admin/dashboard"
          element={
            <RequireRole allowed={['super_admin']}>
              <AidipShell>
                <SuperAdminDashboardPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/super-admin/companies"
          element={
            <RequireRole allowed={['super_admin']}>
              <AidipShell>
                <SuperAdminCompaniesPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/super-admin/companies/new"
          element={
            <RequireRole allowed={['super_admin']}>
              <AidipShell>
                <SuperAdminNewCompanyPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/super-admin/companies/:companyId"
          element={
            <RequireRole allowed={['super_admin']}>
              <AidipShell>
                <SuperAdminCompanyDetailPage />
              </AidipShell>
            </RequireRole>
          }
        />
        <Route
          path="/super-admin/monitoring"
          element={
            <RequireRole allowed={['super_admin']}>
              <AidipShell>
                <SuperAdminMonitoringPage />
              </AidipShell>
            </RequireRole>
          }
        />

        {/* ==================== Fallback ==================== */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
