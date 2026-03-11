import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import BroadcastCampaigns from "./pages/BroadcastCampaigns";
// DESATIVADO: Funcionalidades não disponibilizadas para clientes ainda
// import ChatwootMessages from "./pages/ChatwootMessages";
// import UnifiedMessages from "./pages/UnifiedMessages";
import PeriodicWorkflows from "./pages/PeriodicWorkflows";
import AuthLogs from "./pages/AuthLogs";
import Diagnostics from "./pages/Diagnostics";
import Organization from "./pages/Organization";
import SuperAdmin from "./pages/SuperAdmin";
import SuperAdminCosts from "./pages/SuperAdminCosts";
import AgentsDashboard from "./pages/AgentsDashboard";
import RLSDiagnostics from "./pages/RLSDiagnostics";
import NovaFuncao from "./pages/NovaFuncao";
import BubbleIntegration from "./pages/BubbleIntegration";
import N8nIntegration from "./pages/N8nIntegration";
import Calendar from "./pages/Calendar";
import CRM from "./pages/CRM";
import Gmail from "./pages/Gmail";
import FormBuilder from "./pages/FormBuilder";
import AutomationFlows from "./pages/AutomationFlows";
import GoogleBusinessPosts from "./pages/GoogleBusinessPosts";
import PostSale from "./pages/PostSale";
import AgilizeEmbed from "./pages/AgilizeEmbed";
import Assistant from "./pages/Assistant";
import ReconnectInstance from "./pages/ReconnectInstance";
import NotFound from "./pages/NotFound";
import Cadastro from "./pages/Cadastro";
import Onboarding from "./pages/Onboarding";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/broadcast" element={<BroadcastCampaigns />} />
          {/* DESATIVADO: Funcionalidades não disponibilizadas para clientes ainda */}
          {/* <Route path="/agilizechat" element={<ChatwootMessages />} /> */}
          {/* <Route path="/unified-messages" element={<UnifiedMessages />} /> */}
          <Route path="/workflows" element={<PeriodicWorkflows />} />
          <Route path="/auth-logs" element={<AuthLogs />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/organization" element={<Organization />} />
          <Route path="/superadmin" element={<SuperAdmin />} />
          <Route path="/superadmin/costs" element={<SuperAdminCosts />} />
          <Route path="/rls-diagnostics" element={<RLSDiagnostics />} />
          <Route path="/lista-telefonica" element={<NovaFuncao />} />
          <Route path="/bubble" element={<BubbleIntegration />} />
          <Route path="/n8n" element={<N8nIntegration />} />
          <Route path="/agents" element={<AgentsDashboard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/gmail" element={<Gmail />} />
          <Route path="/form-builder" element={<FormBuilder />} />
          <Route path="/automation-flows" element={<AutomationFlows />} />
          <Route path="/google-business-posts" element={<GoogleBusinessPosts />} />
          <Route path="/post-sale" element={<PostSale />} />
          <Route path="/agilize" element={<AgilizeEmbed />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/reconnect/:notificationId" element={<ReconnectInstance />} />
          <Route path="/reconnect-instance/:instanceId" element={<ReconnectInstance />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
