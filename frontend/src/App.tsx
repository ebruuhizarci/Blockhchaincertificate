import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/context/SessionContext";
import { SessionRouteGuard } from "@/components/layout/SessionRouteGuard";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { AppDashboard } from "@/pages/AppDashboard";
import { InstitutionLoginPage } from "@/pages/InstitutionLoginPage";
import { MyDocumentsPage } from "@/pages/MyDocumentsPage";
import { InstitutionDashboard } from "@/pages/InstitutionDashboard";
import { PaymentResultPage } from "@/pages/PaymentResultPage";
import { AdminLoginPage } from "@/pages/AdminLoginPage";
import { AdminPanelPage } from "@/pages/AdminPanelPage";

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/giris" element={<LoginPage />} />
          <Route path="/admin/giris" element={<AdminLoginPage />} />
          <Route path="/admin/panel" element={<AdminPanelPage />} />
          <Route path="/uye-ol" element={<RegisterPage />} />
          <Route
            path="/uygulama"
            element={
              <SessionRouteGuard blockInstitution>
                <AppDashboard />
              </SessionRouteGuard>
            }
          />
          <Route
            path="/belgelerim"
            element={
              <SessionRouteGuard blockInstitution requireUser>
                <MyDocumentsPage />
              </SessionRouteGuard>
            }
          />
          <Route
            path="/odeme/sonuc"
            element={
              <SessionRouteGuard blockInstitution requireUser>
                <PaymentResultPage />
              </SessionRouteGuard>
            }
          />
          <Route path="/kurum/giris" element={<InstitutionLoginPage />} />
          <Route
            path="/kurum/panel"
            element={
              <SessionRouteGuard institutionOnly>
                <InstitutionDashboard />
              </SessionRouteGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
