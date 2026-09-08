import type {
  AppNotification,
  Attachment,
  Contractor,
  Opportunity,
  OpportunityAssignment,
  OpportunityStatus,
  Profile,
  Quote,
  QuoteLineItem,
  RepairItem,
  RepairRequest,
} from '@/types/domain';
import * as seed from '@/data/seed';
import { getTrade } from '@/data/trades';
import { opportunityCode, quoteNumber, uuid } from '@/lib/ids';
import { routeOpportunity } from '@/lib/matching';
import {
  EMPTY_WORKSPACE,
  type NewRequestDraft,
  type Repository,
  type SubmitResult,
  type Workspace,
} from './repository';

/**
 * In-memory implementation, backed by the demo dataset.
 *
 * This is the Phase 1 DataProvider logic moved behind the repository
 * interface, unchanged in behaviour. It stays in the codebase permanently: it
 * is how the UI is developed without a backend, and how a new contributor gets
 * a working app from a bare `git clone`.
 */
class MockRepository implements Repository {
  readonly kind = 'mock' as const;

  private store: Workspace = MockRepository.freshStore();

  private static freshStore(): Workspace {
    // structuredClone keeps the seed module pristine so resetDemoData works.
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

  async loadWorkspace(_profile: Profile): Promise<Workspace> {
    // No filtering here on purpose: the selectors in src/lib/selectors.ts do
    // it, exactly as they do for the Supabase path where RLS has already
    // filtered. Same code, same result.
    return { ...this.store };
  }

  private notify(
    recipientId: string,
    notification: Omit<AppNotification, 'id' | 'recipient_id' | 'read_at' | 'created_at'>,
  ) {
    this.store.notifications = [
      {
        id: uuid(),
        recipient_id: recipientId,
        read_at: null,
        created_at: new Date().toISOString(),
        ...notification,
      },
      ...this.store.notifications,
    ];
  }

  // -------------------------------------------------------------------------
  // Repair request submission — the multi-trade fan-out
  // -------------------------------------------------------------------------
  async submitRepairRequest(draft: NewRequestDraft, profile: Profile): Promise<SubmitResult> {
    const nowIso = new Date().toISOString();
    const requestId = uuid();
    const reference = Math.max(...this.store.requests.map((r) => r.reference), 1041) + 1;
    const territoryId = seed.territoryForZip(draft.zip);

    const request: RepairRequest = {
      id: requestId,
      reference,
      created_by: profile.id,
      brokerage_id: profile.brokerage_id,
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

      const decision = routeOpportunity(opportunity, this.store.contractors, []);
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
      storage_path: `requests/${requestId}/${f.file_name}`,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      uploaded_by: profile.id,
      created_at: nowIso,
    }));

    this.store = {
      ...this.store,
      requests: [request, ...this.store.requests],
      items: [...this.store.items, ...newItems],
      opportunities: [...this.store.opportunities, ...newOpportunities],
      assignments: [...this.store.assignments, ...newAssignments],
      attachments: [...this.store.attachments, ...newAttachments],
    };

    return { request, opportunities: newOpportunities, warnings: [] };
  }

  // -------------------------------------------------------------------------
  // Opportunity lifecycle
  // -------------------------------------------------------------------------
  async acceptOpportunity(opportunityId: string, contractorId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);

    this.store.opportunities = this.store.opportunities.map((o) =>
      o.id === opportunityId
        ? { ...o, status: 'accepted', contractor_id: contractorId, accepted_at: nowIso, updated_at: nowIso }
        : o,
    );
    this.store.assignments = this.store.assignments.map((a) =>
      a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending'
        ? { ...a, outcome: 'accepted', responded_at: nowIso }
        : a,
    );

    const request = this.store.requests.find((r) => r.id === opportunity?.request_id);
    const contractor = this.store.contractors.find((c) => c.id === contractorId);
    if (opportunity && request && contractor) {
      this.notify(request.created_by, {
        kind: 'opportunity_accepted',
        title: `${contractor.business_name} accepted ${opportunity.code}`,
        body: `${getTrade(opportunity.trade).label} scope at ${request.address_line1}.`,
        link: `/agent/properties/${request.id}`,
      });
    }
  }

  async declineOpportunity(opportunityId: string, contractorId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);
    if (!opportunity) return;

    const priorAssignments = [
      ...this.store.assignments.filter((a) => a.opportunity_id === opportunityId),
      { contractor_id: contractorId } as OpportunityAssignment,
    ];

    // Automatic advance down the routing ladder — no human dispatcher.
    const decision = routeOpportunity(opportunity, this.store.contractors, priorAssignments);

    this.store.opportunities = this.store.opportunities.map((o) =>
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
    );
    this.store.assignments = [
      ...this.store.assignments.map((a) =>
        a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending'
          ? { ...a, outcome: 'declined' as const, responded_at: nowIso }
          : a,
      ),
      ...(decision.assignment ? [decision.assignment] : []),
    ];
  }

  async setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<void> {
    const nowIso = new Date().toISOString();
    this.store.opportunities = this.store.opportunities.map((o) =>
      o.id === opportunityId ? { ...o, status, updated_at: nowIso } : o,
    );
  }

  async rerouteOpportunity(opportunityId: string): Promise<void> {
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);
    if (!opportunity) return;
    const prior = this.store.assignments.filter((a) => a.opportunity_id === opportunityId);
    const decision = routeOpportunity(opportunity, this.store.contractors, prior);
    const nowIso = new Date().toISOString();

    this.store.opportunities = this.store.opportunities.map((o) =>
      o.id === opportunityId
        ? {
            ...o,
            status: decision.nextStatus,
            offered_at: decision.assignment?.offered_at ?? o.offered_at,
            offer_expires_at: decision.assignment?.expires_at ?? null,
            updated_at: nowIso,
          }
        : o,
    );
    if (decision.assignment) {
      this.store.assignments = [...this.store.assignments, decision.assignment];
    }
  }

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------
  async createDraftQuote(opportunityId: string, contractorId: string): Promise<Quote> {
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);
    const request = this.store.requests.find((r) => r.id === opportunity?.request_id);
    const sequence = this.store.quotes.filter((q) => q.opportunity_id === opportunityId).length + 1;
    const nowIso = new Date().toISOString();
    const id = uuid();

    const quote: Quote = {
      id,
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
      items: [
        { id: uuid(), quote_id: id, position: 0, description: '', quantity: 1, unit_price: 0 } as QuoteLineItem,
      ],
    };

    this.store.quotes = [...this.store.quotes, quote];
    await this.setOpportunityStatus(opportunityId, 'quote_in_progress');
    return quote;
  }

  async saveQuote(quote: Quote): Promise<void> {
    this.store.quotes = this.store.quotes.map((q) =>
      q.id === quote.id ? { ...quote, updated_at: new Date().toISOString() } : q,
    );
  }

  async submitQuote(quoteId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const quote = this.store.quotes.find((q) => q.id === quoteId);
    if (!quote) return;

    this.store.quotes = this.store.quotes.map((q) =>
      q.id === quoteId ? { ...q, status: 'submitted', submitted_at: nowIso, updated_at: nowIso } : q,
    );
    this.store.opportunities = this.store.opportunities.map((o) =>
      o.id === quote.opportunity_id ? { ...o, status: 'quote_submitted', updated_at: nowIso } : o,
    );

    const opportunity = this.store.opportunities.find((o) => o.id === quote.opportunity_id);
    const request = this.store.requests.find((r) => r.id === opportunity?.request_id);
    const contractor = this.store.contractors.find((c) => c.id === quote.contractor_id);
    if (opportunity && request && contractor) {
      this.notify(request.created_by, {
        kind: 'quote_submitted',
        title: `Quote received — ${opportunity.code} ${getTrade(opportunity.trade).label}`,
        body: `${contractor.business_name} submitted a quote for ${request.address_line1}.`,
        link: `/agent/properties/${request.id}`,
      });
    }
  }

  async decideQuote(quoteId: string, decision: 'accepted' | 'declined'): Promise<void> {
    const nowIso = new Date().toISOString();
    const quote = this.store.quotes.find((q) => q.id === quoteId);
    if (!quote) return;

    this.store.quotes = this.store.quotes.map((q) =>
      q.id === quoteId ? { ...q, status: decision, decided_at: nowIso } : q,
    );
    this.store.opportunities = this.store.opportunities.map((o) =>
      o.id === quote.opportunity_id
        ? { ...o, status: decision === 'accepted' ? 'quote_accepted' : 'quote_declined', updated_at: nowIso }
        : o,
    );

    const opportunity = this.store.opportunities.find((o) => o.id === quote.opportunity_id);
    const contractorProfile = seed.profiles.find((p) => p.contractor_id === quote.contractor_id);
    if (opportunity && contractorProfile) {
      this.notify(contractorProfile.id, {
        kind: decision === 'accepted' ? 'quote_accepted' : 'quote_declined',
        title: `Quote ${decision} — ${opportunity.code}`,
        body: `The agent ${decision} your quote ${quote.quote_number}.`,
        link: `/contractor/opportunities/${opportunity.id}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Admin, notifications, files
  // -------------------------------------------------------------------------
  async updateContractor(contractorId: string, patch: Partial<Contractor>): Promise<void> {
    this.store.contractors = this.store.contractors.map((c) =>
      c.id === contractorId ? { ...c, ...patch } : c,
    );
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    this.store.notifications = this.store.notifications.map((n) =>
      n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n,
    );
  }

  async markAllNotificationsRead(recipientId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    this.store.notifications = this.store.notifications.map((n) =>
      n.recipient_id === recipientId && !n.read_at ? { ...n, read_at: nowIso } : n,
    );
  }

  async attachmentUrl(_attachment: Attachment): Promise<string | null> {
    // There is no real storage behind demo data, and inventing a URL would be
    // worse than admitting it: the UI shows the file as unavailable.
    return null;
  }

  async resetDemoData(): Promise<void> {
    this.store = MockRepository.freshStore();
  }
}

export function createMockRepository(): Repository {
  return new MockRepository();
}

export { EMPTY_WORKSPACE };
