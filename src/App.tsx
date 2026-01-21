import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/Auth";
import VerifyRecord from "./pages/VerifyRecord";
import VerifyScan from "./pages/VerifyScan";

import { AuthProvider } from "@/providers/AuthProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/layouts/DashboardLayout";
import PatientDashboard from "@/pages/patient/PatientDashboard";
import PatientPrediction from "@/pages/patient/PatientPrediction";
import PatientConsents from "@/pages/patient/PatientConsents";
import PatientTelemedicine from "@/pages/patient/PatientTelemedicine";
import PatientRecords from "@/pages/patient/PatientRecords";
import PatientVerify from "@/pages/patient/PatientVerify";
import DoctorDashboard from "@/pages/doctor/DoctorDashboard";
import DoctorTelemedicine from "@/pages/doctor/DoctorTelemedicine";

const queryClient = new QueryClient();

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-enter">
      <Routes location={location}>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<AuthPage />} />

        <Route path="/verify/:txId" element={<VerifyRecord />} />
        <Route path="/verify" element={<VerifyScan />} />

        <Route
          path="/patient"
          element={
            <ProtectedRoute allow={["patient"]}>
              <DashboardLayout>
                <PatientDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/predict"
          element={
            <ProtectedRoute allow={["patient"]}>
              <DashboardLayout>
                <PatientPrediction />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/records"
          element={
            <ProtectedRoute allow={["patient"]}>
              <DashboardLayout>
                <PatientRecords />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/verify"
          element={
            <ProtectedRoute allow={["patient"]}>
              <DashboardLayout>
                <PatientVerify />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/consents"
          element={
            <ProtectedRoute allow={["patient"]}>
              <DashboardLayout>
                <PatientConsents />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/telemedicine"
          element={
            <ProtectedRoute allow={["patient"]}>
              <DashboardLayout>
                <PatientTelemedicine />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/doctor"
          element={
            <ProtectedRoute allow={["doctor"]}>
              <DashboardLayout>
                <DoctorDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/telemedicine"
          element={
            <ProtectedRoute allow={["doctor"]}>
              <DashboardLayout>
                <DoctorTelemedicine />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route path="/dashboard" element={<Navigate to="/" replace />} />

        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
