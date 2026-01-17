import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/Auth";
import VerifyRecord from "./pages/VerifyRecord";

import { AuthProvider } from "@/providers/AuthProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/layouts/DashboardLayout";
import PatientDashboard from "@/pages/patient/PatientDashboard";
import PatientPrediction from "@/pages/patient/PatientPrediction";
import PatientConsents from "@/pages/patient/PatientConsents";
import PatientTelemedicine from "@/pages/patient/PatientTelemedicine";
import DoctorDashboard from "@/pages/doctor/DoctorDashboard";
import DoctorTelemedicine from "@/pages/doctor/DoctorTelemedicine";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />

            <Route path="/verify/:txId" element={<VerifyRecord />} />

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
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
