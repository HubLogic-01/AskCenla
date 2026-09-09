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
import { findExpiredOffers, routeOpportunity } from '@/lib/matching';
import { deriveRequestStatus } from '@/lib/requestStatus';
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

  /**
   * Mirrors app.sync_request_status(): a request's status follows its
   * opportunities. Called wherever an opportunity status changes, which is
   * what the AFTER UPDATE trigger does server-side.
   */
  private syncRequestStatus(requestId: string) {
    const opportunities = this.store.opportunities.filter((o) => o.request_id === requestId);
    this.store.requests = this.store.requests.map((r) => {
      if (r.id !== requestId) return r;
      const next = deriveRequestStatus(r.status, opportunities);
      return next === r.status ? r : { ...r, status: next, updated_at: new Date().toISOString() };
    });
  }

  /**
   * Mirrors app.record_response(). `offers_received` is the denominator
   * because every offer eventually resolves — accepted, declined or expired —
   * so an ignored offer correctly drags the average down.
   */
  private recordResponse(contractorId: string, hours: number) {
    this.store.contractors = this.store.contractors.map((c) => {
      if (c.id !== contractorId) return c;
      const received = Math.max(c.stats.offers_received, 1);
      const next =
        (c.stats.avg_response_hours * (received - 1) + Math.min(hours, 999)) / received;
      return { ...c, stats: { ...c.stats, avg_response_hours: Math.round(next * 100) / 100 } };
    });
  }

  private hoursSince(iso: string): number {
    return (Date.now() - new Date(iso).getTime()) / 3_600_000;
  }

  /** Mirrors app.notify_unmatched(): tell the agent when the ladder runs out. */
  private notifyUnmatched(opportunityId: string) {
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);
    const request = this.store.requests.find((r) => r.id === opportunity?.request_id);
    if (!opportunity || !request) return;

    const alreadyTold = this.store.notifications.some(
      (n) => n.kind === 'reminder' && n.title.includes(opportunity.code),
    );
    if (alreadyTold) return;

    this.notify(request.created_by, {
      kind: 'reminder',
      title: `${getTrade(opportunity.trade).label} (${opportunity.code}) still needs a contractor`,
      body: 'Every matching contractor has been approached. AskCENLA is expanding the search — you do not need to do anything.',
      link: `/agent/properties/${request.id}`,
    });
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
    const offer = this.store.assignments.find(
      (a) => a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending',
    );
    if (!offer) throw new Error('This opportunity is not currently offered to you');

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

    this.store.contractors = this.store.contractors.map((c) =>
      c.id === contractorId
        ? { ...c, stats: { ...c.stats, offers_accepted: c.stats.offers_accepted + 1 } }
        : c,
    );
    this.recordResponse(contractorId, this.hoursSince(offer.offered_at));

    if (opportunity) this.syncRequestStatus(opportunity.request_id);

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

    const offer = this.store.assignments.find(
      (a) => a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending',
    );
    if (!offer) throw new Error('This opportunity is not currently offered to you');
    this.recordResponse(contractorId, this.hoursSince(offer.offered_at));

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

    if (!decision.assignment) this.notifyUnmatched(opportunityId);
    this.syncRequestStatus(opportunity.request_id);
  }

  async setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<void> {
    const nowIso = new Date().toISOString();
    this.store.opportunities = this.store.opportunities.map((o) =>
      o.id === opportunityId ? { ...o, status, updated_at: nowIso } : o,
    );
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);
    if (opportunity) this.syncRequestStatus(opportunity.request_id);
  }

  async rerouteOpportunity(opportunityId: string): Promise<void> {
    const opportunity = this.store.opportunities.find((o) => o.id === opportunityId);
    if (!opportunity) return;
    if (opportunity.contractor_id) {
      throw new Error('That opportunity has already been accepted by a contractor');
    }

    // Withdraw the live offer first. Without this the ladder would advance
    // while the previous contractor still held a pending offer, and the job
    // would be live with two of them at once.
    const nowWithdrawn = new Date().toISOString();
    this.store.assignments = this.store.assignments.map((a) =>
      a.opportunity_id === opportunityId && a.outcome === 'pending'
        ? { ...a, outcome: 'withdrawn' as const, responded_at: nowWithdrawn }
        : a,
    );

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
    } else {
      this.notifyUnmatched(opportunityId);
    }
  }

  /**
   * Mirrors app.expire_stale_offers(): advance every offer whose response
   * window has lapsed. Server-side this runs on a schedule; here it is the
   * same logic so the admin's manual sweep works on demo data too.
   */
  async runOfferSweep(): Promise<number> {
    const lapsed = findExpiredOffers(this.store.assignments).filter((assignment) => {
      const opportunity = this.store.opportunities.find((o) => o.id === assignment.opportunity_id);
      // Leave alone anything a contractor has already taken on.
      return opportunity?.status === 'offered';
    });

    const nowIso = new Date().toISOString();
    for (const assignment of lapsed) {
      this.store.assignments = this.store.assignments.map((a) =>
        a.id === assignment.id ? { ...a, outcome: 'expired' as const, responded_at: nowIso } : a,
      );
      // An ignored offer is a response too — the slowest possible one.
      this.recordResponse(assignment.contractor_id, this.hoursSince(assignment.offered_at));
      await this.rerouteOpportunity(assignment.opportunity_id);
    }
    return lapsed.length;
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

  async uploadQuoteAttachment(quoteId: string, file: File): Promise<void> {
    const quote = this.store.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new Error('That quote no longer exists');

    // No real storage behind demo data, so this records the file the same way
    // the real upload does and the list renders identically. Opening it will
    // honestly say the contents are unavailable.
    this.store.attachments = [
      ...this.store.attachments,
      {
        id: uuid(),
        request_id: null,
        quote_id: quoteId,
        kind: 'quote_attachment',
        file_name: file.name,
        storage_path: `quotes/${quoteId}/${file.name}`,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        uploaded_by: quote.contractor_id,
        created_at: new Date().toISOString(),
      },
    ];
  }

  async removeAttachment(attachment: Attachment): Promise<void> {
    this.store.attachments = this.store.attachments.filter((a) => a.id !== attachment.id);
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
    if (opportunity) this.syncRequestStatus(opportunity.request_id);

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
    if (opportunity) this.syncRequestStatus(opportunity.request_id);

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
