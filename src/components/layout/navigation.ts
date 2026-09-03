import type { IconName } from '@/components/ui/Icon';
import type { UserRole } from '@/types/domain';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Matches nested routes too (e.g. /agent/properties/123). */
  end?: boolean;
  /** Key into the badge counts the shell computes. */
  countKey?: 'contractorNew' | 'agentQuotes' | 'adminUnmatched' | 'brokerAttention';
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** One place that decides what each role can navigate to. */
export const NAV_BY_ROLE: Record<UserRole, NavSection[]> = {
  agent: [
    {
      items: [
        { to: '/agent', label: 'Dashboard', icon: 'home', end: true },
        { to: '/agent/properties', label: 'Properties', icon: 'building' },
        { to: '/agent/quotes', label: 'Quotes', icon: 'file', countKey: 'agentQuotes' },
      ],
    },
    {
      title: 'Create',
      items: [{ to: '/agent/requests/new', label: 'New Repair Request', icon: 'plus' }],
    },
  ],
  broker: [
    {
      items: [
        { to: '/broker', label: 'Brokerage Overview', icon: 'home', end: true },
        { to: '/broker/opportunities', label: 'All Opportunities', icon: 'clipboard', countKey: 'brokerAttention' },
        { to: '/broker/agents', label: 'Agents', icon: 'users' },
      ],
    },
  ],
  contractor: [
    {
      items: [
        { to: '/contractor', label: 'Dashboard', icon: 'home', end: true },
        { to: '/contractor/opportunities', label: 'Opportunities', icon: 'inbox', countKey: 'contractorNew' },
        { to: '/contractor/quotes', label: 'My Quotes', icon: 'file' },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/contractor/profile', label: 'Business Profile', icon: 'briefcase' },
        { to: '/contractor/membership', label: 'Membership', icon: 'dollar' },
      ],
    },
  ],
  admin: [
    {
      items: [
        { to: '/admin', label: 'Marketplace', icon: 'chart', end: true },
        { to: '/admin/requests', label: 'Repair Requests', icon: 'clipboard' },
        { to: '/admin/routing', label: 'Routing Monitor', icon: 'route', countKey: 'adminUnmatched' },
      ],
    },
    {
      title: 'Network',
      items: [
        { to: '/admin/contractors', label: 'Contractors', icon: 'briefcase' },
        { to: '/admin/users', label: 'Users', icon: 'users' },
      ],
    },
  ],
};

export const ROLE_LABEL: Record<UserRole, string> = {
  agent: 'Agent',
  broker: 'Broker',
  contractor: 'Contractor',
  admin: 'Administrator',
};
