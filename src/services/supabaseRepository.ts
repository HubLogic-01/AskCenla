import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppNotification,
  Attachment,
  Contractor,
  Opportunity,
  OpportunityAssignment,
  OpportunityStatus,
  Profile,
  Quote,
  RepairItem,
  RepairRequest,
} from '@/types/domain';
import type {
  ContractorRow,
  Database,
  OfferedOpportunityRow,
  OpportunityRow,
  QuoteItemRow,
  QuoteRow,
  RepairItemRow,
  RepairRequestRow,
} from '@/types/database';
import {
  NotYetLiveError,
  type NewRequestDraft,
  type Repository,
  type SubmitResult,
  type Workspace,
} from './repository';

/**
 * Supabase implementation.
 *
 * Two things are worth understanding before reading further.
 *
 * 1. THERE ARE NO PERMISSION FILTERS IN THIS FILE. Every `select` fetches
 *    "all rows", and Row Level Security decides what that means for the
 *    signed-in user. An agent's `select * from repair_requests` returns three
 *    rows; an admin's returns every one. That is deliberate — a filter written
 *    here would be a second, weaker copy of a rule that already exists in the
 *    database, and the two would eventually disagree.
 *
 * 2. WRITES THAT CROSS TABLES GO THROUGH RPCs. Submitting a repair request
 *    creates a request, N items, N opportunities and N assignments. Doing that
 *    as separate client calls risks a browser dying halfway and leaving a
 *    property with no opportunities, so it is one transactional Postgres
 *    function instead.
 */

// ---------------------------------------------------------------------------
// Row -> domain mapping. The shapes are near-identical by design; the only
// real difference is `trade_key` in the database vs `trade` in the UI types.
// ---------------------------------------------------------------------------

function toRequest(row: RepairRequestRow): RepairRequest {
  return {
    id: row.id,
    reference: row.reference,
    created_by: row.created_by,
    brokerage_id: row.brokerage_id,
    address_line1: row.address_line1,
    city: row.city,
    state: row.state,
    zip: row.zip,
    mls_number: row.mls_number,
    transaction_type: row.transaction_type,
    status: row.status,
    contact_name: row.contact_name,
    contact_brokerage: row.contact_brokerage,
    contact_phone: row.contact_phone,
    contact_email: row.contact_email,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toItem(row: RepairItemRow): RepairItem {
  return {
    id: row.id,
    request_id: row.request_id,
    trade: row.trade_key,
    description: row.description,
    urgency: row.urgency,
    estimate_deadline: row.estimate_deadline,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    code: row.code,
    request_id: row.request_id,
    repair_item_id: row.repair_item_id,
    trade: row.trade_key,
    territory_id: row.territory_id,
    status: row.status,
    contractor_id: row.contractor_id,
    routing_position: row.routing_position,
    offered_at: row.offered_at,
    offer_expires_at: row.offer_expires_at,
    accepted_at: row.accepted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toContractor(row: ContractorRow, trades: string[], territories: string[]): Contractor {
  return {
    id: row.id,
    business_name: row.business_name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    address_line1: row.address_line1,
    city: row.city,
    state: row.state,
    zip: row.zip ?? '',
    trades: trades as Contractor['trades'],
    territory_ids: territories,
    license_number: row.license_number,
    license_expires_on: row.license_expires_on,
    insurance_carrier: row.insurance_carrier,
    insurance_expires_on: row.insurance_expires_on,
    availability: row.availability,
    membership_status: row.membership_status,
    is_active: row.is_active,
    accepting_opportunities: row.accepting_opportunities,
    rotation_priority: row.rotation_priority,
    stats: {
      offers_received: row.offers_received,
      offers_accepted: row.offers_accepted,
      avg_response_hours: Number(row.avg_response_hours),
      jobs_won: row.jobs_won,
    },
    created_at: row.created_at,
  };
}

function toQuote(row: QuoteRow, items: QuoteItemRow[]): Quote {
  return {
    id: row.id,
    quote_number: row.quote_number,
    opportunity_id: row.opportunity_id,
    contractor_id: row.contractor_id,
    status: row.status,
    notes: row.notes,
    exclusions: row.exclusions,
    tax_rate: Number(row.tax_rate),
    expires_on: row.expires_on,
    submitted_at: row.submitted_at,
    decided_at: row.decided_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: items
      .filter((i) => i.quote_id === row.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        quote_id: i.quote_id,
        position: i.position,
        description: i.description,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })),
  };
}

/**
 * Builds redacted stand-ins for a contractor's PENDING offers.
 *
 * The contractor cannot read `repair_requests` or `repair_items` for a job
 * they have not accepted — RLS blocks it — so those rows arrive through the
 * `offered_opportunities` view instead, which carries the city, ZIP and scope
 * but has no address, MLS number or contact columns at all.
 *
 * Synthesising partial rows here means every screen keeps using the same
 * selectors and renders identically in both modes. The blank `address_line1`
 * is the honest representation of "we genuinely do not have this yet"; the
 * opportunity card already falls back to the general location before
 * acceptance.
 */
function redactedRowsFromFeed(feed: OfferedOpportunityRow[]): {
  requests: RepairRequest[];
  items: RepairItem[];
} {
  const requests: RepairRequest[] = [];
  const items: RepairItem[] = [];

  for (const row of feed) {
    const syntheticRequestId = `offer:${row.opportunity_id}`;
    requests.push({
      id: syntheticRequestId,
      reference: 0,
      created_by: '',
      brokerage_id: null,
      address_line1: '',
      city: row.city,
      state: row.state,
      zip: row.zip,
      mls_number: null,
      transaction_type: 'other',
      status: 'submitted',
      contact_name: '',
      contact_brokerage: '',
      contact_phone: '',
      contact_email: '',
      submitted_at: row.created_at,
      created_at: row.created_at,
      updated_at: row.created_at,
    });
    items.push({
      id: `offer-item:${row.opportunity_id}`,
      request_id: syntheticRequestId,
      trade: row.trade_key,
      description: row.description,
      urgency: row.urgency,
      estimate_deadline: row.estimate_deadline,
      notes: null,
      created_at: row.created_at,
    });
  }

  return { requests, items };
}

class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;

  constructor(private readonly db: SupabaseClient<Database>) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------
  async loadWorkspace(profile: Profile): Promise<Workspace> {
    const [
      contractors,
      contractorTrades,
      contractorTerritories,
      requests,
      items,
      opportunities,
      assignments,
      quotes,
      quoteItems,
      attachments,
      notifications,
    ] = await Promise.all([
      this.db.from('contractors').select('*'),
      this.db.from('contractor_trades').select('*'),
      this.db.from('contractor_territories').select('*'),
      this.db.from('repair_requests').select('*'),
      this.db.from('repair_items').select('*'),
      this.db.from('opportunities').select('*'),
      this.db.from('opportunity_assignments').select('*'),
      this.db.from('quotes').select('*'),
      this.db.from('quote_items').select('*'),
      this.db.from('attachments').select('*'),
      this.db.from('notifications').select('*').order('created_at', { ascending: false }),
    ]);

    // The pre-acceptance feed is only meaningful for contractors, and it is
    // fetched separately so the query above stays a single homogeneous batch.
    const feed =
      profile.role === 'contractor'
        ? await this.db.from('offered_opportunities').select('*')
        : { data: [] as OfferedOpportunityRow[], error: null };

    const firstError = [
      contractors, contractorTrades, contractorTerritories, requests, items,
      opportunities, assignments, quotes, quoteItems, attachments, notifications,
    ].find((r) => r.error);
    if (firstError?.error) {
      throw new Error(`Could not load your workspace: ${firstError.error.message}`);
    }
    if (feed.error) {
      throw new Error(`Could not load your opportunities: ${feed.error.message}`);
    }

    const tradesByContractor = new Map<string, string[]>();
    for (const row of contractorTrades.data ?? []) {
      const list = tradesByContractor.get(row.contractor_id) ?? [];
      list.push(row.trade_key);
      tradesByContractor.set(row.contractor_id, list);
    }

    const territoriesByContractor = new Map<string, string[]>();
    for (const row of contractorTerritories.data ?? []) {
      const list = territoriesByContractor.get(row.contractor_id) ?? [];
      list.push(row.territory_id);
      territoriesByContractor.set(row.contractor_id, list);
    }

    const redacted = redactedRowsFromFeed((feed.data ?? []) as OfferedOpportunityRow[]);

    // A contractor's pending offers come from the view; anything they have
    // accepted comes from the tables. Prefer the real row when both exist.
    const realRequestIds = new Set((requests.data ?? []).map((r) => r.id));
    const opportunityRequestId = new Map(
      (opportunities.data ?? []).map((o) => [o.id, o.request_id] as const),
    );

    const stubRequests = redacted.requests.filter((stub) => {
      const opportunityId = stub.id.slice('offer:'.length);
      const realId = opportunityRequestId.get(opportunityId);
      return !realId || !realRequestIds.has(realId);
    });
    const stubItems = redacted.items.filter((stub) =>
      stubRequests.some((r) => r.id === stub.request_id),
    );

    // Point an opportunity at its stub when its real request is not visible.
    const stubRequestByOpportunity = new Map(
      stubRequests.map((r) => [r.id.slice('offer:'.length), r.id] as const),
    );

    const mappedOpportunities = (opportunities.data ?? []).map((row) => {
      const mapped = toOpportunity(row);
      const stubId = stubRequestByOpportunity.get(row.id);
      if (stubId) {
        return { ...mapped, request_id: stubId, repair_item_id: `offer-item:${row.id}` };
      }
      return mapped;
    });

    return {
      contractors: (contractors.data ?? []).map((row) =>
        toContractor(
          row,
          tradesByContractor.get(row.id) ?? [],
          territoriesByContractor.get(row.id) ?? [],
        ),
      ),
      requests: [...(requests.data ?? []).map(toRequest), ...stubRequests],
      items: [...(items.data ?? []).map(toItem), ...stubItems],
      opportunities: mappedOpportunities,
      assignments: (assignments.data ?? []) as OpportunityAssignment[],
      quotes: (quotes.data ?? []).map((row) => toQuote(row, (quoteItems.data ?? []) as QuoteItemRow[])),
      attachments: (attachments.data ?? []) as Attachment[],
      notifications: (notifications.data ?? []) as AppNotification[],
    };
  }

  // -------------------------------------------------------------------------
  // Repair request submission
  // -------------------------------------------------------------------------
  async submitRepairRequest(draft: NewRequestDraft, profile: Profile): Promise<SubmitResult> {
    // One transactional call: request + items + opportunities + routing.
    // `created_by` and `brokerage_id` are derived from the session inside the
    // function and ignored if present in this payload.
    const { data, error } = await this.db.rpc('submit_repair_request', {
      p_payload: {
        address_line1: draft.address_line1,
        city: draft.city,
        state: draft.state,
        zip: draft.zip,
        mls_number: draft.mls_number,
        transaction_type: draft.transaction_type,
        contact_name: draft.contact_name,
        contact_brokerage: draft.contact_brokerage,
        contact_phone: draft.contact_phone,
        contact_email: draft.contact_email,
        items: draft.items.map((i) => ({
          trade: i.trade,
          description: i.description,
          urgency: i.urgency,
          estimate_deadline: i.estimate_deadline || null,
          notes: i.notes || null,
        })),
      },
    });

    if (error) throw new Error(error.message);
    const result = data;

    // Files are uploaded after the request exists, because the storage path
    // includes its id. A failure here must not discard the saved request, so
    // it is reported as a warning rather than thrown.
    const warnings = await this.uploadDraftFiles(result.request_id, draft, profile);

    const { data: requestRow, error: requestError } = await this.db
      .from('repair_requests')
      .select('*')
      .eq('id', result.request_id)
      .single();
    if (requestError) throw new Error(requestError.message);

    const { data: opportunityRows } = await this.db
      .from('opportunities')
      .select('*')
      .eq('request_id', result.request_id);

    return {
      request: toRequest(requestRow),
      opportunities: (opportunityRows ?? []).map(toOpportunity),
      warnings,
    };
  }

  /** Uploads to the private bucket, then records each file in `attachments`. */
  private async uploadDraftFiles(
    requestId: string,
    draft: NewRequestDraft,
    profile: Profile,
  ): Promise<string[]> {
    const warnings: string[] = [];

    for (const draftFile of draft.files) {
      if (!draftFile.file) {
        warnings.push(`${draftFile.file_name} could not be uploaded (the file was no longer available).`);
        continue;
      }
      const path = `requests/${requestId}/${draftFile.file_name}`;

      const { error: uploadError } = await this.db.storage
        .from('attachments')
        .upload(path, draftFile.file, { contentType: draftFile.mime_type, upsert: false });

      if (uploadError) {
        warnings.push(`${draftFile.file_name} could not be uploaded: ${uploadError.message}`);
        continue;
      }

      const { error: rowError } = await this.db.from('attachments').insert({
        request_id: requestId,
        kind: draftFile.kind,
        file_name: draftFile.file_name,
        storage_path: path,
        mime_type: draftFile.mime_type,
        size_bytes: draftFile.size_bytes,
        uploaded_by: profile.id,
      });

      if (rowError) {
        warnings.push(`${draftFile.file_name} uploaded but could not be recorded: ${rowError.message}`);
      }
    }

    return warnings;
  }

  // -------------------------------------------------------------------------
  // Opportunity lifecycle
  //
  // Accepting reassigns an opportunity that currently belongs to nobody, and
  // declining has to advance the rotation — neither is expressible as a row
  // update a contractor is allowed to make, by design. Both become RPCs in
  // Phase 5, alongside the scheduled expiry sweep.
  // -------------------------------------------------------------------------
  async acceptOpportunity(): Promise<void> {
    throw new NotYetLiveError('Accepting an opportunity', 'Phase 5');
  }

  async declineOpportunity(): Promise<void> {
    throw new NotYetLiveError('Declining an opportunity', 'Phase 5');
  }

  async rerouteOpportunity(): Promise<void> {
    throw new NotYetLiveError('Manual re-routing', 'Phase 5');
  }

  async setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<void> {
    const { error } = await this.db
      .from('opportunities')
      .update({ status })
      .eq('id', opportunityId);
    if (error) throw new Error(error.message);
  }

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------
  async createDraftQuote(): Promise<Quote> {
    throw new NotYetLiveError('Building a quote', 'Phase 6');
  }

  async saveQuote(): Promise<void> {
    throw new NotYetLiveError('Saving a quote', 'Phase 6');
  }

  async submitQuote(): Promise<void> {
    throw new NotYetLiveError('Submitting a quote', 'Phase 6');
  }

  async decideQuote(quoteId: string, decision: 'accepted' | 'declined'): Promise<void> {
    // The agent's accept/decline is a plain update the RLS policy already
    // permits on a submitted quote, so this one needs no RPC.
    const { error } = await this.db
      .from('quotes')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', quoteId);
    if (error) throw new Error(error.message);

    const { data: quote } = await this.db
      .from('quotes')
      .select('opportunity_id')
      .eq('id', quoteId)
      .single();

    if (quote) {
      await this.setOpportunityStatus(
        quote.opportunity_id,
        decision === 'accepted' ? 'quote_accepted' : 'quote_declined',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Admin, notifications, files
  // -------------------------------------------------------------------------
  async updateContractor(contractorId: string, patch: Partial<Contractor>): Promise<void> {
    // `trades` and `territory_ids` live in join tables, and `stats` is
    // denormalized onto columns the platform owns, so none of them belong in a
    // direct column update. Those editors are wired up in Phase 8.
    const { trades, territory_ids, stats, ...columns } = patch;
    if (trades || territory_ids || stats) {
      throw new NotYetLiveError('Editing trades, territories or statistics', 'Phase 8');
    }
    if (Object.keys(columns).length === 0) return;

    const { error } = await this.db
      .from('contractors')
      .update(columns)
      .eq('id', contractorId);
    if (error) throw new Error(error.message);
  }

  async runOfferSweep(): Promise<number> {
    // Server-side this also runs on a pg_cron schedule; the RPC exists so an
    // administrator does not have to wait for the next tick.
    const { data, error } = await this.db.rpc('run_offer_sweep');
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);
    if (error) throw new Error(error.message);
  }

  async markAllNotificationsRead(recipientId: string): Promise<void> {
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', recipientId)
      .is('read_at', null);
    if (error) throw new Error(error.message);
  }

  async attachmentUrl(attachment: Attachment): Promise<string | null> {
    // Short-lived and issued per request. Supabase only grants it if the
    // storage policies pass for this user, so an unauthorised viewer gets null
    // rather than a working link.
    const { data, error } = await this.db.storage
      .from('attachments')
      .createSignedUrl(attachment.storage_path, 60);
    if (error) {
      console.error('Could not create signed URL:', error.message);
      return null;
    }
    return data.signedUrl;
  }

  async resetDemoData(): Promise<void> {
    // Never destroy real data.
  }
}

export function createSupabaseRepository(db: SupabaseClient<Database>): Repository {
  return new SupabaseRepository(db);
}
