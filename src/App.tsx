import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AuthEmployee from "./pages/AuthEmployee";
import AuthAdmin from "./pages/AuthAdmin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminRounds from "./pages/AdminRounds";
import AdminQuestions from "./pages/AdminQuestions";
import AdminSecuritySmoke from "./pages/AdminSecuritySmoke";
import RoundPlay from "./pages/RoundPlay";
import Leaderboard from "./pages/Leaderboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthEmployee />} />
          <Route path="/round/:roundNo" element={<RoundPlay />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/admin" element={<AuthAdmin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/rounds" element={<AdminRounds />} />
          <Route path="/admin/questions" element={<AdminQuestions />} />
          <Route path="/admin/questions/:roundNo" element={<AdminQuestions />} />
          <Route path="/admin/security-smoke" element={<AdminSecuritySmoke />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
