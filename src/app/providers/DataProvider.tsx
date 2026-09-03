import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  AppNotification,
  Attachment,
  AttachmentKind,
  Contractor,
  Opportunity,
  OpportunityAssignment,
  OpportunityStatus,
  Quote,
  QuoteLineItem,
  RepairItem,
  RepairRequest,
  TradeKey,
  TransactionType,
  UrgencyLevel,
} from '@/types/domain';
import * as seed from '@/data/seed';
import { getTrade } from '@/data/trades';
import { opportunityCode, quoteNumber, uuid } from '@/lib/ids';
import { routeOpportunity } from '@/lib/matching';

/**
 * DATA LAYER
 * ---------------------------------------------------------------------------
 * Every read and write in the app goes through this provider. Components never
 * touch the seed data directly.
 *
 * Why this matters for Phase 2: replacing the mock store with Supabase means
 * rewriting the bodies of the functions below (a `supabase.from(...).insert()`
 * instead of a `setState`), not touching a single screen. The action names
 * already read like the operations the database will perform.
 */

interface Store {
  contractors: Contractor[];
  requests: RepairRequest[];
  items: RepairItem[];
  opportunities: Opportunity[];
  assignments: OpportunityAssignment[];
  quotes: Quote[];
  attachments: Attachment[];
  notifications: AppNotification[];
}

export interface DraftRepairItem {
  trade: TradeKey;
  description: string;
  urgency: UrgencyLevel;
  estimate_deadline: string;
  notes: string;
}

export interface DraftAttachment {
  file_name: string;
  size_bytes: number;
  mime_type: string;
  kind: AttachmentKind;
}

export interface NewRequestDraft {
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  mls_number: string;
  transaction_type: TransactionType;
  items: DraftRepairItem[];
  files: DraftAttachment[];
  contact_name: string;
  contact_brokerage: string;
  contact_phone: string;
  contact_email: string;
}

export interface SubmitResult {
  request: RepairRequest;
  opportunities: Opportunity[];
}

interface DataContextValue extends Store {
  /** Creates the parent request, one repair item + opportunity per trade, and routes each. */
  submitRepairRequest: (draft: NewRequestDraft, createdBy: string, brokerageId: string | null) => SubmitResult;
  acceptOpportunity: (opportunityId: string, contractorId: string) => void;
  declineOpportunity: (opportunityId: string, contractorId: string) => void;
  setOpportunityStatus: (opportunityId: string, status: OpportunityStatus) => void;
  /** Re-runs the matching engine for an opportunity that has no contractor. */
  rerouteOpportunity: (opportunityId: string) => void;
  saveQuote: (quote: Quote) => void;
  submitQuote: (quoteId: string) => void;
  decideQuote: (quoteId: string, decision: 'accepted' | 'declined') => void;
  createDraftQuote: (opportunityId: string, contractorId: string) => Quote;
  updateContractor: (contractorId: string, patch: Partial<Contractor>) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: (recipientId: string) => void;
  resetDemoData: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function initialStore(): Store {
  // Structured clone keeps the seed module pristine so "Reset demo data" works.
  return {
    contractors: structuredClone(seed.contractors),
    requests: structuredClone(seed.repairRequests),
    items: structuredClone(seed.repairItems),
    opportunities: structuredClone(seed.opportunities),
    assignments: structuredClone(seed.opportunityAssignments),
    quotes: structuredClone(seed.quotes),
    attachments: structuredClone(seed.attachments),
    notifications: structuredClone(seed.notifications),
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(initialStore);

  const notify = useCallback(
    (recipientId: string, notification: Omit<AppNotification, 'id' | 'recipient_id' | 'read_at' | 'created_at'>) => {
      setStore((s) => ({
        ...s,
        notifications: [
          {
            id: uuid(),
            recipient_id: recipientId,
            read_at: null,
            created_at: new Date().toISOString(),
            ...notification,
          },
          ...s.notifications,
        ],
      }));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Repair request submission — the core multi-trade fan-out
  // -------------------------------------------------------------------------
  const submitRepairRequest = useCallback<DataContextValue['submitRepairRequest']>(
    (draft, createdBy, brokerageId) => {
      const nowIso = new Date().toISOString();
      const requestId = uuid();
      const reference = Math.max(...seed.repairRequests.map((r) => r.reference), 1041) + 1;
      const territoryId = seed.territoryForZip(draft.zip);

      const request: RepairRequest = {
        id: requestId,
        reference,
        created_by: createdBy,
        brokerage_id: brokerageId,
        address_line1: draft.address_line1,
        city: draft.city,
        state: draft.state,
        zip: draft.zip,
        mls_number: draft.mls_number || null,
        transaction_type: draft.transaction_type,
        status: 'submitted',
        contact_name: draft.contact_name,
        contact_brokerage: draft.contact_brokerage,
        contact_phone: draft.contact_phone,
        contact_email: draft.contact_email,
        submitted_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const newItems: RepairItem[] = [];
      const newOpportunities: Opportunity[] = [];
      const newAssignments: OpportunityAssignment[] = [];

      // ONE repair item and ONE independently-routed opportunity per trade.
      for (const draftItem of draft.items) {
        const itemId = uuid();
        newItems.push({
          id: itemId,
          request_id: requestId,
          trade: draftItem.trade,
          description: draftItem.description,
          urgency: draftItem.urgency,
          estimate_deadline: draftItem.estimate_deadline || null,
          notes: draftItem.notes || null,
          created_at: nowIso,
        });

        const opportunity: Opportunity = {
          id: uuid(),
          code: opportunityCode(reference, getTrade(draftItem.trade).code),
          request_id: requestId,
          repair_item_id: itemId,
          trade: draftItem.trade,
          territory_id: territoryId,
          status: 'matching',
          contractor_id: null,
          routing_position: 0,
          offered_at: null,
          offer_expires_at: null,
          accepted_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        // Run the matching engine immediately — no admin in the loop.
        const decision = routeOpportunity(opportunity, store.contractors, []);
        opportunity.status = decision.nextStatus;
        if (decision.assignment) {
          opportunity.offered_at = decision.assignment.offered_at;
          opportunity.offer_expires_at = decision.assignment.expires_at;
          newAssignments.push(decision.assignment);
        }
        newOpportunities.push(opportunity);
      }

      const newAttachments: Attachment[] = draft.files.map((f) => ({
        id: uuid(),
        request_id: requestId,
        quote_id: null,
        kind: f.kind,
        file_name: f.file_name,
        storage_path: `private/${requestId}/${f.file_name}`,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
        uploaded_by: createdBy,
        created_at: nowIso,
      }));

      setStore((s) => ({
        ...s,
        requests: [request, ...s.requests],
        items: [...s.items, ...newItems],
        opportunities: [...s.opportunities, ...newOpportunities],
        assignments: [...s.assignments, ...newAssignments],
        attachments: [...s.attachments, ...newAttachments],
      }));

      return { request, opportunities: newOpportunities };
    },
    [store.contractors],
  );

  // -------------------------------------------------------------------------
  // Opportunity lifecycle
  // -------------------------------------------------------------------------
  const acceptOpportunity = useCallback<DataContextValue['acceptOpportunity']>(
    (opportunityId, contractorId) => {
      const nowIso = new Date().toISOString();
      setStore((s) => ({
        ...s,
        opportunities: s.opportunities.map((o) =>
          o.id === opportunityId
            ? { ...o, status: 'accepted', contractor_id: contractorId, accepted_at: nowIso, updated_at: nowIso }
            : o,
        ),
        assignments: s.assignments.map((a) =>
          a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending'
            ? { ...a, outcome: 'accepted', responded_at: nowIso }
            : a,
        ),
      }));

      const opportunity = store.opportunities.find((o) => o.id === opportunityId);
      const request = store.requests.find((r) => r.id === opportunity?.request_id);
      const contractor = store.contractors.find((c) => c.id === contractorId);
      if (opportunity && request && contractor) {
        notify(request.created_by, {
          kind: 'opportunity_accepted',
          title: `${contractor.business_name} accepted ${opportunity.code}`,
          body: `${getTrade(opportunity.trade).label} scope at ${request.address_line1}.`,
          link: `/agent/properties/${request.id}`,
        });
      }
    },
    [store.opportunities, store.requests, store.contractors, notify],
  );

  const declineOpportunity = useCallback<DataContextValue['declineOpportunity']>(
    (opportunityId, contractorId) => {
      const nowIso = new Date().toISOString();
      const opportunity = store.opportunities.find((o) => o.id === opportunityId);
      if (!opportunity) return;

      const priorAssignments = [
        ...store.assignments.filter((a) => a.opportunity_id === opportunityId),
        { contractor_id: contractorId } as OpportunityAssignment,
      ];

      // Automatic advance down the routing ladder — no human dispatcher needed.
      const decision = routeOpportunity(opportunity, store.contractors, priorAssignments);

      setStore((s) => ({
        ...s,
        opportunities: s.opportunities.map((o) =>
          o.id === opportunityId
            ? {
                ...o,
                status: decision.nextStatus,
                contractor_id: null,
                routing_position: o.routing_position + 1,
                offered_at: decision.assignment?.offered_at ?? o.offered_at,
                offer_expires_at: decision.assignment?.expires_at ?? null,
                updated_at: nowIso,
              }
            : o,
        ),
        assignments: [
          ...s.assignments.map((a) =>
            a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending'
              ? { ...a, outcome: 'declined' as const, responded_at: nowIso }
              : a,
          ),
          ...(decision.assignment ? [decision.assignment] : []),
        ],
      }));
    },
    [store.opportunities, store.assignments, store.contractors],
  );

  const setOpportunityStatus = useCallback<DataContextValue['setOpportunityStatus']>((opportunityId, status) => {
    const nowIso = new Date().toISOString();
    setStore((s) => ({
      ...s,
      opportunities: s.opportunities.map((o) =>
        o.id === opportunityId ? { ...o, status, updated_at: nowIso } : o,
      ),
    }));
  }, []);

  const rerouteOpportunity = useCallback<DataContextValue['rerouteOpportunity']>(
    (opportunityId) => {
      const opportunity = store.opportunities.find((o) => o.id === opportunityId);
      if (!opportunity) return;
      const prior = store.assignments.filter((a) => a.opportunity_id === opportunityId);
      const decision = routeOpportunity(opportunity, store.contractors, prior);
      const nowIso = new Date().toISOString();

      setStore((s) => ({
        ...s,
        opportunities: s.opportunities.map((o) =>
          o.id === opportunityId
            ? {
                ...o,
                status: decision.nextStatus,
                offered_at: decision.assignment?.offered_at ?? o.offered_at,
                offer_expires_at: decision.assignment?.expires_at ?? null,
                updated_at: nowIso,
              }
            : o,
        ),
        assignments: decision.assignment ? [...s.assignments, decision.assignment] : s.assignments,
      }));
    },
    [store.opportunities, store.assignments, store.contractors],
  );

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------
  const createDraftQuote = useCallback<DataContextValue['createDraftQuote']>(
    (opportunityId, contractorId) => {
      const opportunity = store.opportunities.find((o) => o.id === opportunityId);
      const request = store.requests.find((r) => r.id === opportunity?.request_id);
      const sequence = store.quotes.filter((q) => q.opportunity_id === opportunityId).length + 1;
      const nowIso = new Date().toISOString();

      const quote: Quote = {
        id: uuid(),
        quote_number:
          opportunity && request
            ? quoteNumber(request.reference, getTrade(opportunity.trade).code, sequence)
            : `Q-${sequence}`,
        opportunity_id: opportunityId,
        contractor_id: contractorId,
        status: 'draft',
        notes: null,
        exclusions: null,
        tax_rate: 0,
        expires_on: null,
        submitted_at: null,
        decided_at: null,
        created_at: nowIso,
        updated_at: nowIso,
        items: [{ id: uuid(), quote_id: '', position: 0, description: '', quantity: 1, unit_price: 0 } as QuoteLineItem],
      };

      setStore((s) => ({ ...s, quotes: [...s.quotes, quote] }));
      setOpportunityStatus(opportunityId, 'quote_in_progress');
      return quote;
    },
    [store.opportunities, store.requests, store.quotes, setOpportunityStatus],
  );

  const saveQuote = useCallback<DataContextValue['saveQuote']>((quote) => {
    setStore((s) => ({
      ...s,
      quotes: s.quotes.map((q) => (q.id === quote.id ? { ...quote, updated_at: new Date().toISOString() } : q)),
    }));
  }, []);

  const submitQuote = useCallback<DataContextValue['submitQuote']>(
    (quoteId) => {
      const nowIso = new Date().toISOString();
      const quote = store.quotes.find((q) => q.id === quoteId);
      if (!quote) return;

      setStore((s) => ({
        ...s,
        quotes: s.quotes.map((q) =>
          q.id === quoteId ? { ...q, status: 'submitted', submitted_at: nowIso, updated_at: nowIso } : q,
        ),
        opportunities: s.opportunities.map((o) =>
          o.id === quote.opportunity_id ? { ...o, status: 'quote_submitted', updated_at: nowIso } : o,
        ),
      }));

      const opportunity = store.opportunities.find((o) => o.id === quote.opportunity_id);
      const request = store.requests.find((r) => r.id === opportunity?.request_id);
      const contractor = store.contractors.find((c) => c.id === quote.contractor_id);
      if (opportunity && request && contractor) {
        notify(request.created_by, {
          kind: 'quote_submitted',
          title: `Quote received — ${opportunity.code} ${getTrade(opportunity.trade).label}`,
          body: `${contractor.business_name} submitted a quote for ${request.address_line1}.`,
          link: `/agent/properties/${request.id}`,
        });
      }
    },
    [store.quotes, store.opportunities, store.requests, store.contractors, notify],
  );

  const decideQuote = useCallback<DataContextValue['decideQuote']>(
    (quoteId, decision) => {
      const nowIso = new Date().toISOString();
      const quote = store.quotes.find((q) => q.id === quoteId);
      if (!quote) return;

      setStore((s) => ({
        ...s,
        quotes: s.quotes.map((q) => (q.id === quoteId ? { ...q, status: decision, decided_at: nowIso } : q)),
        opportunities: s.opportunities.map((o) =>
          o.id === quote.opportunity_id
            ? { ...o, status: decision === 'accepted' ? 'quote_accepted' : 'quote_declined', updated_at: nowIso }
            : o,
        ),
      }));

      const opportunity = store.opportunities.find((o) => o.id === quote.opportunity_id);
      const contractorProfile = seed.profiles.find((p) => p.contractor_id === quote.contractor_id);
      if (opportunity && contractorProfile) {
        notify(contractorProfile.id, {
          kind: decision === 'accepted' ? 'quote_accepted' : 'quote_declined',
          title: `Quote ${decision} — ${opportunity.code}`,
          body: `The agent ${decision} your quote ${quote.quote_number}.`,
          link: `/contractor/opportunities/${opportunity.id}`,
        });
      }
    },
    [store.quotes, store.opportunities, notify],
  );

  // -------------------------------------------------------------------------
  // Admin & notifications
  // -------------------------------------------------------------------------
  const updateContractor = useCallback<DataContextValue['updateContractor']>((contractorId, patch) => {
    setStore((s) => ({
      ...s,
      contractors: s.contractors.map((c) => (c.id === contractorId ? { ...c, ...patch } : c)),
    }));
  }, []);

  const markNotificationRead = useCallback<DataContextValue['markNotificationRead']>((notificationId) => {
    setStore((s) => ({
      ...s,
      notifications: s.notifications.map((n) =>
        n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    }));
  }, []);

  const markAllNotificationsRead = useCallback<DataContextValue['markAllNotificationsRead']>((recipientId) => {
    const nowIso = new Date().toISOString();
    setStore((s) => ({
      ...s,
      notifications: s.notifications.map((n) =>
        n.recipient_id === recipientId && !n.read_at ? { ...n, read_at: nowIso } : n,
      ),
    }));
  }, []);

  const resetDemoData = useCallback(() => setStore(initialStore()), []);

  const value = useMemo<DataContextValue>(
    () => ({
      ...store,
      submitRepairRequest,
      acceptOpportunity,
      declineOpportunity,
      setOpportunityStatus,
      rerouteOpportunity,
      saveQuote,
      submitQuote,
      decideQuote,
      createDraftQuote,
      updateContractor,
      markNotificationRead,
      markAllNotificationsRead,
      resetDemoData,
    }),
    [
      store,
      submitRepairRequest,
      acceptOpportunity,
      declineOpportunity,
      setOpportunityStatus,
      rerouteOpportunity,
      saveQuote,
      submitQuote,
      decideQuote,
      createDraftQuote,
      updateContractor,
      markNotificationRead,
      markAllNotificationsRead,
      resetDemoData,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
