import type { DraftAttachment, DraftRepairItem } from '@/app/providers/DataProvider';
import type { TransactionType } from '@/types/domain';

export interface WizardState {
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

export const WIZARD_STEPS = [
  { id: 1, label: 'Property' },
  { id: 2, label: 'Repair Needs' },
  { id: 3, label: 'Documents' },
  { id: 4, label: 'Contact' },
  { id: 5, label: 'Review & Submit' },
] as const;

export type StepErrors = Record<string, string>;

/**
 * Validation lives beside the state, not inside the components, so the same
 * rules can be reused by the review step and (later) mirrored as database
 * constraints.
 */
export function validateStep(step: number, s: WizardState): StepErrors {
  const errors: StepErrors = {};

  if (step === 1) {
    if (!s.address_line1.trim()) errors.address_line1 = 'Property address is required.';
    if (!s.city.trim()) errors.city = 'City is required.';
    if (!s.state.trim()) errors.state = 'State is required.';
    if (!/^\d{5}$/.test(s.zip.trim())) errors.zip = 'Enter a 5-digit ZIP code.';
  }

  if (step === 2) {
    if (s.items.length === 0) errors.items = 'Select at least one trade.';
    s.items.forEach((item, i) => {
      if (!item.description.trim()) errors[`item-${i}`] = 'Describe the repair needed.';
    });
  }

  if (step === 4) {
    if (!s.contact_name.trim()) errors.contact_name = 'Your name is required.';
    if (!s.contact_brokerage.trim()) errors.contact_brokerage = 'Brokerage is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.contact_email.trim())) errors.contact_email = 'Enter a valid email address.';
    if (s.contact_phone.replace(/\D/g, '').length < 10) errors.contact_phone = 'Enter a 10-digit phone number.';
  }

  return errors;
}
