import type { Money, VerificationStatus } from '@maknaz/shared';

export interface Category { id: string; code: string; name_ar: string; name_en: string; cargo_class: string; is_active: boolean }

export interface Listing {
  id: string;
  title: string;
  status: string;
  category: Category;
  physical_state: string;
  mine: { id: string; name: string; region_code: string; lat: number; lng: number; organization_id: string; organization_name: string | null };
  quantity: { total: string; reserved: string; sold: string; available: string; unit: string };
  asking_price: Money & { per: string };
  is_negotiable: boolean;
  lab_reported_specs: number;
  has_lab_report: boolean;
  distance_from_site: { straight_line_km: string; label: string } | null;
  published_at: string | null;
  version: number;
}

export interface Spec { id: string; property_name: string; value_numeric: string | null; value_text: string | null; unit: string | null; verification_status: VerificationStatus; document_id: string | null }
export interface DocumentItem { id: string; doc_type: string; title: string; visibility: string; mime_type: string; size_bytes: number; lab_name: string | null; issued_on: string | null; can_download: boolean }

export interface ListingDetail extends Listing {
  description: string | null;
  loading_conditions: string;
  available_from: string | null;
  available_until: string | null;
  specifications: Spec[];
  documents: DocumentItem[];
  is_owner: boolean;
  my_open_offer: { id: string; reference: string; status: string } | null;
  reference_site_id: string | null;
  open_offers?: number;
  active_deals?: number;
}

export interface Round {
  id: string;
  round_no: number;
  proposed_by: 'FACTORY' | 'MINE';
  quantity_tons: string;
  unit_price: Money;
  material_value: Money;
  loading_window_start: string | null;
  loading_window_end: string | null;
  message: string | null;
  status: string;
  expires_at: string;
  responded_at: string | null;
  response_note: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  reference: string;
  status: string;
  listing: { id: string; title: string; status: string; mine_name: string; mine_region: string; available: string; asking_price: Money };
  factory: { id: string; name_ar: string | null };
  mine_org: { id: string; name_ar: string | null };
  delivery_site: { id: string; name: string; region_code: string };
  distance: { straight_line_km: string; label: string };
  current_round: Round;
  rounds: Round[];
  deal: { id: string; reference: string; status: string } | null;
  created_at: string;
}

export interface Deal {
  id: string;
  reference: string;
  status: string;
  stage: string;
  viewer_role: 'FACTORY' | 'MINE' | 'CARRIER' | 'ADMIN';
  parties: { factory: { id: string; name_ar: string | null }; mine: { id: string; name_ar: string | null }; carrier: { id: string; name_ar: string | null } | null };
  material: { title: string; category_name: string; cargo_class: string; listing_id: string };
  route: {
    mine: { name: string; region_code: string; lat: number; lng: number };
    delivery_site: { name: string; region_code: string; lat: number; lng: number };
    straight_line_km: string;
    route_distance_km: string | null;
  };
  commercial: { quantity_tons: string; unit_price: Money; material_total: Money; specifications_at_agreement: { property_name: string; value_numeric: string | null; value_text: string | null; unit: string | null; verification_status: VerificationStatus }[] };
  transport: { total: Money; quote_id: string } | null;
  grand_total: Money | null;
  loading_window: { start: string; end: string };
  deadlines: { carrier_deadline_at: string; retry_deadline_at: string | null; payment_deadline_at: string | null; next: { type: string; at: string } | null };
  quotes_summary: { submitted: number; total: number };
  shipment: { id: string; status: string; planned_pickup_at: string | null; pickup_deadline_at: string | null; reassignment_deadline_at: string | null } | null;
  invoice: { id: string; reference: string; payment_status: string; grand_total: Money; payment_deadline_at: string; pending_adjustment: { invoice_item_id: string; amount: Money } | null } | null;
  cancellation: { reason: string; note: string | null; fault_party: string | null; cancelled_at: string | null } | null;
  actions: { can_cancel: boolean; can_select_quote: boolean; can_pay: boolean; can_admin_cancel: boolean };
  agreed_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  offer_id: string;
}

export interface PriceLine { code: string; label_ar: string; amount_halalas: number }
export interface Quote {
  id: string;
  status: string;
  carrier: { id: string; name_ar: string | null };
  total: Money;
  per_ton?: Money | null;
  trips?: number;
  service?: { name: string; vehicle_type: string; includes_loading: boolean; includes_unloading: boolean } | null;
  proposed_pickup_at?: string;
  estimated_transit_hours?: string;
  route_distance_km?: string;
  straight_line_km_to_mine?: string;
  straight_line_km_mine_to_factory?: string;
  distance_band?: string;
  price_breakdown?: { model: string; lines: PriceLine[]; conditional: { code: string; label_ar: string; rate_halalas_per_hour: number }[]; total: Money };
  terms?: string | null;
  is_reassignment?: boolean;
  expires_at: string;
}

export interface EligibleCarrier {
  carrier: { id: string; name_ar: string };
  nearest_location: { id: string; name: string };
  straight_line_km_to_mine: string;
  distance_band: string;
  services: { id: string; name: string; vehicle_type: string; payload_tons_per_vehicle: string; pricing_model: string }[];
  indicative_price: (Money & { label: string; route_estimate_km: string }) | null;
  has_submitted_quote: boolean;
}

export interface Opportunity {
  deal_id: string;
  reference: string;
  status: string;
  is_reassignment: boolean;
  material: { title: string; category_name: string; cargo_class: string };
  quantity_tons: string;
  origin: { mine_name: string; region_code: string; lat: number; lng: number };
  destination: { site_name: string; region_code: string; lat: number; lng: number };
  loading_conditions: string;
  loading_window_start: string;
  loading_window_end: string;
  distance_band: string;
  straight_line_km_to_mine: string;
  straight_line_km_mine_to_factory: string;
  route_estimate_km: string;
  nearest_location: { id: string; name: string };
  eligible_services: { id: string; name: string; vehicle_type: string; payload_tons_per_vehicle: string; pricing_model: string; includes_loading: boolean; includes_unloading: boolean }[];
  deadline_at: string | null;
  my_quote: { id: string; status: string; total: Money } | null;
  operating_locations?: { id: string; name: string }[];
}

export interface Shipment {
  id: string;
  status: string;
  viewer_role: string;
  deal: { id: string; reference: string; status: string; quantity_tons: string };
  material_title: string;
  origin: string;
  destination: string;
  carrier: { id: string; name_ar: string | null } | null;
  pickup_window: { start: string; end: string };
  planned_pickup_at: string | null;
  pickup_deadline_at: string | null;
  original_pickup_deadline_at: string | null;
  auto_cancel_at: string | null;
  extension_count: number;
  extensions_remaining: number;
  max_extension_hours: number;
  reconfirm_deadline_at: string | null;
  reassignment_deadline_at: string | null;
  expected_delivery_at: string | null;
  picked_up_at: string | null;
  handover_confirmed_at: string | null;
  delivered_at: string | null;
  loaded_tons: string | null;
  received_tons: string | null;
  extensions: { sequence_no: number; previous_deadline_at: string; new_deadline_at: string; reason_label: string; reason_text: string; reconfirmation_status: string; decline_reason: string | null; created_at: string }[];
  events: { id: string; event_type: string; from_status: string | null; to_status: string | null; actor_type: string; actor_org_name: string | null; note: string | null; occurred_at: string }[];
  actions: Record<'can_mark_ready' | 'can_extend' | 'can_confirm_handover' | 'can_pickup' | 'can_start_transit' | 'can_deliver' | 'can_reconfirm' | 'can_confirm_receipt', boolean>;
}

export interface Invoice {
  id: string;
  reference: string;
  deal: { id: string; reference: string; status: string };
  parties: {
    buyer: { legal_name_ar: string; commercial_registration_no: string; city: string };
    mine: { legal_name_ar: string; commercial_registration_no: string; city: string };
    carrier: { legal_name_ar: string; commercial_registration_no: string; city: string };
    material: { title: string; category: string };
    quantity_tons: string;
    conditional_charges: { label_ar: string; rate_halalas_per_hour: number }[];
  };
  items: { id: string; item_type: string; description_ar: string; quantity: string | null; unit_amount: Money | null; line_total: Money }[];
  material_total: Money;
  transport_total: Money;
  additional_charges: Money;
  grand_total: Money;
  adjustments_total: Money;
  paid_total: Money;
  refunded_total: Money;
  payment_status: string;
  issued_at: string;
  payment_deadline_at: string;
  payments: { id: string; kind: string; amount: Money; simulated_reference: string; created_at: string }[];
  refunds: { id: string; amount: Money; status: string; reason: string; simulated_reference: string; initiated_at: string }[];
  pending_adjustment: { invoice_item_id: string; amount: Money } | null;
  can_pay: boolean;
  simulation_label: string;
  tax_note: string;
}

export interface Site { id: string; name: string; region_code: string; address_text: string | null; lat: number; lng: number; status: string }
export interface Mine extends Site { primary_activity: string; active_listings: number; organization_name: string | null; has_open_deals?: boolean }
