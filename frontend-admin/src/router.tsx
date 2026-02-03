import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AdminLayout } from "./views/AdminLayout";
import { AppDetailPage } from "./views/AppDetailPage";
import { AuditPage } from "./views/AuditPage";
import { AppsPage } from "./views/AppsPage";
import { DashboardPage } from "./views/DashboardPage";
import { FeedbackPage } from "./views/FeedbackPage";
import { JobDetailPage } from "./views/JobDetailPage";
import { JobsPage } from "./views/JobsPage";
import { KbsPage } from "./views/KbsPage";
import { KbDetailPage } from "./views/KbDetailPage";
import { LoginPage } from "./views/LoginPage";
import { ObservabilityPage } from "./views/ObservabilityPage";
import { PagesPage } from "./views/PagesPage";
import { PageDetailPage } from "./views/PageDetailPage";
import { RetrievalEventDetailPage } from "./views/RetrievalEventDetailPage";
import { SettingsPage } from "./views/SettingsPage";
import { requireToken } from "./lib/auth";
import { WorkspaceProvider } from "./lib/workspace";

/**
 * 路由守卫组件
 * 检查用户是否已登录，未登录则重定向到登录页
 */
function AuthGuard() {
  const location = useLocation();
  if (!requireToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <WorkspaceProvider>
      <AdminLayout />
    </WorkspaceProvider>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AuthGuard />}>
          {/* 首页 - 系统总览 */}
          <Route index element={<DashboardPage />} />

          {/* 内容管理 */}
          <Route path="kbs" element={<KbsPage />} />
          <Route path="kbs/:kbId" element={<KbDetailPage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="apps/:appId" element={<AppDetailPage />} />

          {/* 详情页 - 保留用于查看单个页面/任务 */}
          <Route path="pages" element={<PagesPage />} />
          <Route path="pages/:pageId" element={<PageDetailPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:jobId" element={<JobDetailPage />} />

          {/* 运营监控 */}
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="observability" element={<ObservabilityPage />} />
          <Route path="observability/retrieval-events/:eventId" element={<RetrievalEventDetailPage />} />

          {/* 系统 */}
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
