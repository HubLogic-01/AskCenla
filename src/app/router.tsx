import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { LandingPage, NotFoundPage } from '@/features/marketing/LandingPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignUpPage } from '@/features/auth/SignUpPage';

import { AgentDashboard } from '@/features/agent/AgentDashboard';
import { AgentProperties } from '@/features/agent/AgentProperties';
import { PropertyDashboard } from '@/features/agent/PropertyDashboard';
import { AgentQuotes } from '@/features/agent/AgentQuotes';
import { AgentQuoteView } from '@/features/agent/AgentQuoteView';
import { NewRequestWizard } from '@/features/agent/wizard/NewRequestWizard';

import { ContractorDashboard } from '@/features/contractor/ContractorDashboard';
import { ContractorOpportunities } from '@/features/contractor/ContractorOpportunities';
import { OpportunityDetail } from '@/features/contractor/OpportunityDetail';
import { ContractorQuotes } from '@/features/contractor/ContractorQuotes';
import { QuoteBuilder } from '@/features/contractor/QuoteBuilder';
import { ContractorProfile } from '@/features/contractor/ContractorProfile';
import { ContractorMembership } from '@/features/contractor/ContractorMembership';

import { BrokerDashboard } from '@/features/broker/BrokerDashboard';
import { BrokerOpportunities } from '@/features/broker/BrokerOpportunities';
import { BrokerAgents } from '@/features/broker/BrokerAgents';

import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { AdminContractors } from '@/features/admin/AdminContractors';
import { AdminRequests } from '@/features/admin/AdminRequests';
import { AdminRouting } from '@/features/admin/AdminRouting';
import { AdminUsers } from '@/features/admin/AdminUsers';

/**
 * Routing is grouped by role. Each group is wrapped in <RequireAuth roles=[...]>
 * so adding a screen means adding one <Route>, and access control is declared
 * next to the routes rather than scattered inside components.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* -------------------------------- Public ------------------------- */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />

      {/* -------------------------------- Agent -------------------------- */}
      <Route element={<RequireAuth roles={['agent']} />}>
        <Route element={<AppShell />}>
          <Route path="/agent" element={<AgentDashboard />} />
          <Route path="/agent/properties" element={<AgentProperties />} />
          <Route path="/agent/properties/:requestId" element={<PropertyDashboard />} />
          <Route path="/agent/requests/new" element={<NewRequestWizard />} />
          <Route path="/agent/quotes" element={<AgentQuotes />} />
          <Route path="/agent/quotes/:quoteId" element={<AgentQuoteView />} />
        </Route>
      </Route>

      {/* ----------------------------- Contractor ------------------------ */}
      <Route element={<RequireAuth roles={['contractor']} />}>
        <Route element={<AppShell />}>
          <Route path="/contractor" element={<ContractorDashboard />} />
          <Route path="/contractor/opportunities" element={<ContractorOpportunities />} />
          <Route path="/contractor/opportunities/:opportunityId" element={<OpportunityDetail />} />
          <Route path="/contractor/quotes" element={<ContractorQuotes />} />
          <Route path="/contractor/quotes/:quoteId" element={<QuoteBuilder />} />
          <Route path="/contractor/profile" element={<ContractorProfile />} />
          <Route path="/contractor/membership" element={<ContractorMembership />} />
        </Route>
      </Route>

      {/* -------------------------------- Broker ------------------------- */}
      <Route element={<RequireAuth roles={['broker']} />}>
        <Route element={<AppShell />}>
          <Route path="/broker" element={<BrokerDashboard />} />
          <Route path="/broker/opportunities" element={<BrokerOpportunities />} />
          <Route path="/broker/agents" element={<BrokerAgents />} />
        </Route>
      </Route>

      {/* -------------------------------- Admin -------------------------- */}
      <Route element={<RequireAuth roles={['admin']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/contractors" element={<AdminContractors />} />
          <Route path="/admin/requests" element={<AdminRequests />} />
          <Route path="/admin/routing" element={<AdminRouting />} />
          <Route path="/admin/users" element={<AdminUsers />} />
        </Route>
      </Route>

      {/* Legacy/idle paths land somewhere sensible instead of a dead end. */}
      <Route path="/dashboard" element={<Navigate to="/agent" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
