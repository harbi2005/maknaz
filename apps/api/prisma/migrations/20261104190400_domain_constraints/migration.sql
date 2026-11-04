-- Domain constraints from docs/03-architecture/DATABASE_DESIGN.md that Prisma's schema
-- language cannot express: CHECK constraints, partial unique indexes, immutability
-- triggers and append-only tables. These are the last line of defence; the service
-- layer validates the same rules first and returns domain error codes.

-- ── accounts ──────────────────────────────────────────────────────────────
ALTER TABLE users ADD CONSTRAINT users_status_ck CHECK (status IN ('ACTIVE','DISABLED'));
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

ALTER TABLE organizations
  ADD CONSTRAINT organizations_type_ck CHECK (type IN ('FACTORY','MINE','CARRIER')),
  ADD CONSTRAINT organizations_status_ck CHECK (status IN ('PENDING_REVIEW','ACTIVE','REJECTED','SUSPENDED')),
  ADD CONSTRAINT organizations_reason_ck CHECK (status NOT IN ('REJECTED','SUSPENDED') OR status_reason IS NOT NULL);

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_ck CHECK (role IN ('OWNER','MEMBER')),
  ADD CONSTRAINT organization_members_status_ck CHECK (status IN ('INVITED','ACTIVE','REMOVED'));
-- ASSUMPTION (DATABASE_DESIGN §3.1): one active organization per user in the MVP.
CREATE UNIQUE INDEX organization_members_one_active_uq ON organization_members (user_id) WHERE status = 'ACTIVE';

ALTER TABLE organization_licenses
  ADD CONSTRAINT organization_licenses_type_ck CHECK (license_type IN ('COMMERCIAL_TRANSPORT','WASTE_TRANSPORT_PERMIT','MINING_LICENSE','OTHER')),
  ADD CONSTRAINT organization_licenses_review_ck CHECK (review_status IN ('NOT_REVIEWED','REVIEWED_DOCUMENT_PRESENT','REVIEWED_ISSUE_FOUND'));

-- ── sites ─────────────────────────────────────────────────────────────────
ALTER TABLE mines
  ADD CONSTRAINT mines_lat_ck CHECK (lat BETWEEN -90 AND 90),
  ADD CONSTRAINT mines_lng_ck CHECK (lng BETWEEN -180 AND 180),
  ADD CONSTRAINT mines_status_ck CHECK (status IN ('ACTIVE','INACTIVE'));
ALTER TABLE factory_sites
  ADD CONSTRAINT factory_sites_lat_ck CHECK (lat BETWEEN -90 AND 90),
  ADD CONSTRAINT factory_sites_lng_ck CHECK (lng BETWEEN -180 AND 180),
  ADD CONSTRAINT factory_sites_status_ck CHECK (status IN ('ACTIVE','INACTIVE'));
ALTER TABLE carrier_operating_locations
  ADD CONSTRAINT col_lat_ck CHECK (lat BETWEEN -90 AND 90),
  ADD CONSTRAINT col_lng_ck CHECK (lng BETWEEN -180 AND 180),
  ADD CONSTRAINT col_kind_ck CHECK (location_kind IN ('FLEET_YARD','DEPOT','PORT','RAIL_TERMINAL'));

-- ── catalog ───────────────────────────────────────────────────────────────
ALTER TABLE material_categories
  ADD CONSTRAINT material_categories_cargo_ck CHECK (cargo_class IN ('BULK_SOLID','FINE_POWDER','SLURRY','PACKAGED','SPECIAL'));

ALTER TABLE material_listings
  ADD CONSTRAINT material_listings_state_ck CHECK (physical_state IN ('SOLID_LUMP','GRANULAR','POWDER','SLURRY','OTHER')),
  ADD CONSTRAINT material_listings_unit_ck CHECK (unit = 'TON'),
  ADD CONSTRAINT material_listings_total_ck CHECK (total_quantity > 0),
  ADD CONSTRAINT material_listings_reserved_ck CHECK (reserved_quantity >= 0),
  ADD CONSTRAINT material_listings_sold_ck CHECK (sold_quantity >= 0),
  -- BR-010 / ADR-007: the final guard against overselling.
  ADD CONSTRAINT material_listings_available_ck CHECK (reserved_quantity + sold_quantity <= total_quantity),
  ADD CONSTRAINT material_listings_price_ck CHECK (asking_price_halalas > 0),
  ADD CONSTRAINT material_listings_status_ck CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED'));

ALTER TABLE material_specifications
  ADD CONSTRAINT material_specifications_status_ck CHECK (verification_status IN ('LAB_REPORTED','DECLARED','ESTIMATED','UNKNOWN')),
  ADD CONSTRAINT material_specifications_lab_doc_ck CHECK (verification_status <> 'LAB_REPORTED' OR document_id IS NOT NULL),
  ADD CONSTRAINT material_specifications_value_ck CHECK (verification_status = 'UNKNOWN' OR value_numeric IS NOT NULL OR value_text IS NOT NULL);

ALTER TABLE material_documents
  ADD CONSTRAINT material_documents_type_ck CHECK (doc_type IN ('LAB_REPORT','SDS','PHOTO','OTHER')),
  ADD CONSTRAINT material_documents_mime_ck CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  ADD CONSTRAINT material_documents_size_ck CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  ADD CONSTRAINT material_documents_visibility_ck CHECK (visibility IN ('PUBLIC','ON_REQUEST','PRIVATE'));

ALTER TABLE inventory_reservations
  ADD CONSTRAINT inventory_reservations_qty_ck CHECK (quantity > 0),
  ADD CONSTRAINT inventory_reservations_status_ck CHECK (status IN ('ACTIVE','RELEASED','CONSUMED'));

-- ── trading ───────────────────────────────────────────────────────────────
ALTER TABLE purchase_offers
  ADD CONSTRAINT purchase_offers_status_ck CHECK (status IN ('SUBMITTED','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED'));
-- BR-021: one open offer per (factory, listing).
CREATE UNIQUE INDEX purchase_offers_one_open_uq ON purchase_offers (listing_id, factory_org_id)
  WHERE status IN ('SUBMITTED','COUNTERED');

ALTER TABLE offer_negotiation_rounds
  ADD CONSTRAINT rounds_no_ck CHECK (round_no IN (1,2)),
  ADD CONSTRAINT rounds_by_ck CHECK (proposed_by IN ('FACTORY','MINE')),
  ADD CONSTRAINT rounds_qty_ck CHECK (quantity > 0),
  ADD CONSTRAINT rounds_price_ck CHECK (unit_price_halalas > 0),
  ADD CONSTRAINT rounds_window_ck CHECK (loading_window_end IS NULL OR loading_window_start IS NULL OR loading_window_end > loading_window_start),
  ADD CONSTRAINT rounds_status_ck CHECK (status IN ('PENDING','ACCEPTED','REJECTED','COUNTERED','WITHDRAWN','EXPIRED'));
CREATE UNIQUE INDEX rounds_one_pending_uq ON offer_negotiation_rounds (offer_id) WHERE status = 'PENDING';

ALTER TABLE deals
  ADD CONSTRAINT deals_status_ck CHECK (status IN ('PENDING_CARRIER','PENDING_CARRIER_RETRY','AWAITING_PAYMENT','PAID','IN_FULFILLMENT','COMPLETED','CANCELLED')),
  ADD CONSTRAINT deals_cancel_ck CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)),
  ADD CONSTRAINT deals_quote_ck CHECK (status NOT IN ('AWAITING_PAYMENT','PAID','IN_FULFILLMENT','COMPLETED') OR selected_quote_id IS NOT NULL),
  ADD CONSTRAINT deals_reason_ck CHECK (cancellation_reason IS NULL OR cancellation_reason IN (
    'NO_CARRIER_CONFIRMED','PAYMENT_EXPIRED','PICKUP_MISSED','NO_CARRIER_REASSIGNED','REASSIGNMENT_PRICE_DECLINED',
    'CANCELLED_BY_FACTORY','CANCELLED_BY_MINE','ADMIN_CANCELLED','ORG_SUSPENDED')),
  ADD CONSTRAINT deals_fault_ck CHECK (cancellation_fault_party IS NULL OR cancellation_fault_party IN ('FACTORY','MINE','CARRIER','NONE','UNDETERMINED')),
  ADD CONSTRAINT deals_window_ck CHECK (loading_window_end > loading_window_start),
  ADD CONSTRAINT deals_amounts_ck CHECK (quantity_tons > 0 AND unit_price_halalas > 0 AND material_total_halalas > 0);

-- ── carriers & pricing ────────────────────────────────────────────────────
ALTER TABLE carrier_service_areas
  ADD CONSTRAINT csa_type_ck CHECK (area_type IN ('REGION','COUNTRY','RADIUS')),
  ADD CONSTRAINT csa_fields_ck CHECK (
    (area_type = 'REGION' AND region_code IS NOT NULL) OR
    (area_type = 'COUNTRY' AND country_code IS NOT NULL) OR
    (area_type = 'RADIUS' AND operating_location_id IS NOT NULL AND radius_km IS NOT NULL));

ALTER TABLE carrier_services
  ADD CONSTRAINT cs_cargo_ck CHECK (cardinality(supported_cargo_classes) > 0 AND
    supported_cargo_classes <@ ARRAY['BULK_SOLID','FINE_POWDER','SLURRY','PACKAGED','SPECIAL']::text[]),
  ADD CONSTRAINT cs_payload_ck CHECK (payload_tons_per_vehicle > 0),
  ADD CONSTRAINT cs_vehicles_ck CHECK (vehicles_available >= 1),
  ADD CONSTRAINT cs_min_ck CHECK (min_shipment_tons >= 0),
  ADD CONSTRAINT cs_max_ck CHECK (max_shipment_tons >= min_shipment_tons);

ALTER TABLE carrier_pricing_rule_versions
  ADD CONSTRAINT cprv_model_ck CHECK (pricing_model IN ('PER_KM','PER_TON','PER_TON_KM','FIXED_ROUTE')),
  ADD CONSTRAINT cprv_required_ck CHECK (
    (pricing_model = 'PER_KM' AND rate_per_km IS NOT NULL) OR
    (pricing_model = 'PER_TON' AND rate_per_ton IS NOT NULL) OR
    (pricing_model = 'PER_TON_KM' AND rate_per_ton_km IS NOT NULL) OR
    (pricing_model = 'FIXED_ROUTE' AND fixed_route_price_halalas IS NOT NULL
       AND route_origin_region IS NOT NULL AND route_destination_region IS NOT NULL)),
  ADD CONSTRAINT cprv_nonneg_ck CHECK (
    base_fee_halalas >= 0 AND coalesce(rate_per_km,0) >= 0 AND coalesce(rate_per_ton,0) >= 0 AND
    coalesce(rate_per_ton_km,0) >= 0 AND coalesce(fixed_route_price_halalas,0) >= 0 AND
    loading_fee_halalas >= 0 AND unloading_fee_halalas >= 0 AND handling_fee_halalas >= 0 AND
    waiting_fee_per_hour_halalas >= 0 AND free_waiting_hours >= 0 AND minimum_charge_halalas >= 0),
  ADD CONSTRAINT cprv_basis_ck CHECK (distance_basis IN ('PER_TRIP','PER_SHIPMENT')),
  ADD CONSTRAINT cprv_fee_basis_ck CHECK (fee_basis IN ('FLAT','PER_TON')),
  ADD CONSTRAINT cprv_validity_ck CHECK (valid_to IS NULL OR valid_to > valid_from),
  ADD CONSTRAINT cprv_status_ck CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED'));

-- Non-overlapping ACTIVE validity per rule (DATABASE_DESIGN §3.5).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE carrier_pricing_rule_versions ADD CONSTRAINT cprv_no_overlap_ex
  EXCLUDE USING gist (rule_id WITH =, tstzrange(valid_from, valid_to) WITH &&) WHERE (status = 'ACTIVE');

-- Versions are immutable once they leave DRAFT, except status and valid_to.
CREATE FUNCTION cprv_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
      (to_jsonb(NEW) - 'status' - 'valid_to' - 'activated_at') IS DISTINCT FROM
      (to_jsonb(OLD) - 'status' - 'valid_to' - 'activated_at')) THEN
    RAISE EXCEPTION 'pricing rule version % is immutable once activated', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cprv_immutable_tr BEFORE UPDATE ON carrier_pricing_rule_versions
  FOR EACH ROW EXECUTE FUNCTION cprv_immutable();

ALTER TABLE transport_quotes
  ADD CONSTRAINT tq_band_ck CHECK (distance_band IN ('B1','B2','B3','B4')),
  ADD CONSTRAINT tq_route_ck CHECK (route_distance_km >= straight_line_km_mine_to_factory),
  ADD CONSTRAINT tq_trips_ck CHECK (trips >= 1),
  ADD CONSTRAINT tq_transit_ck CHECK (estimated_transit_hours > 0),
  ADD CONSTRAINT tq_total_ck CHECK (transport_total_halalas > 0),
  ADD CONSTRAINT tq_status_ck CHECK (status IN ('SUBMITTED','SELECTED','NOT_SELECTED','WITHDRAWN','EXPIRED','RELEASED','FULFILLED'));
CREATE UNIQUE INDEX tq_one_submitted_uq ON transport_quotes (deal_id, carrier_org_id) WHERE status = 'SUBMITTED';
CREATE UNIQUE INDEX tq_one_selected_uq ON transport_quotes (deal_id) WHERE status = 'SELECTED';

-- ── logistics ─────────────────────────────────────────────────────────────
ALTER TABLE shipments
  ADD CONSTRAINT shipments_status_ck CHECK (status IN ('PENDING_CARRIER','CARRIER_CONFIRMED','SCHEDULED','RECONFIRM_REQUIRED',
    'READY_FOR_PICKUP','PICKED_UP','IN_TRANSIT','DELAYED','DELIVERED','COMPLETED','CANCELLED')),
  ADD CONSTRAINT shipments_ext_ck CHECK (extension_count BETWEEN 0 AND 2),
  ADD CONSTRAINT shipments_carrier_ck CHECK (status NOT IN ('CARRIER_CONFIRMED','SCHEDULED','RECONFIRM_REQUIRED','READY_FOR_PICKUP',
    'PICKED_UP','IN_TRANSIT','DELAYED','DELIVERED','COMPLETED') OR carrier_org_id IS NOT NULL);

ALTER TABLE shipment_extensions
  ADD CONSTRAINT se_seq_ck CHECK (sequence_no IN (1,2)),
  ADD CONSTRAINT se_window_ck CHECK (new_deadline_at > previous_deadline_at AND new_deadline_at - previous_deadline_at <= interval '72 hours'),
  ADD CONSTRAINT se_reason_ck CHECK (reason_code IN ('MATERIAL_NOT_READY','EQUIPMENT_ISSUE','SITE_ACCESS','WEATHER','REGULATORY','OTHER')),
  ADD CONSTRAINT se_text_ck CHECK (char_length(reason_text) BETWEEN 10 AND 500),
  ADD CONSTRAINT se_reconfirm_ck CHECK (reconfirmation_status IN ('NOT_REQUIRED','PENDING','CONFIRMED','DECLINED','TIMED_OUT','SUPERSEDED'));

ALTER TABLE shipment_events ADD CONSTRAINT sev_actor_ck CHECK (actor_type IN ('USER','SYSTEM','ADMIN'));

-- ── billing (simulated) ───────────────────────────────────────────────────
ALTER TABLE invoices
  ADD CONSTRAINT invoices_total_ck CHECK (grand_total_halalas = material_total_halalas + transport_total_halalas + additional_charges_halalas),
  ADD CONSTRAINT invoices_status_ck CHECK (payment_status IN ('PAYMENT_PENDING','SIMULATED_PAYMENT_COMPLETED','PAYMENT_EXPIRED',
    'SIMULATED_REFUND_INITIATED','SIMULATED_REFUND_COMPLETED')),
  ADD CONSTRAINT invoices_simulated_ck CHECK (is_simulated = true);

-- BR-078 / ADR-009: amounts and snapshot are immutable after issue.
CREATE FUNCTION invoices_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.material_total_halalas <> OLD.material_total_halalas
     OR NEW.transport_total_halalas <> OLD.transport_total_halalas
     OR NEW.additional_charges_halalas <> OLD.additional_charges_halalas
     OR NEW.grand_total_halalas <> OLD.grand_total_halalas THEN
    RAISE EXCEPTION 'invoice % amounts and snapshot are immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_immutable_tr BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION invoices_immutable();

ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_type_ck CHECK (item_type IN ('MATERIAL','TRANSPORT','LOADING','UNLOADING','HANDLING','ADJUSTMENT'));

ALTER TABLE simulated_payments
  ADD CONSTRAINT sp_kind_ck CHECK (kind IN ('PRIMARY','ADJUSTMENT')),
  ADD CONSTRAINT sp_amount_ck CHECK (amount_halalas > 0),
  ADD CONSTRAINT sp_status_ck CHECK (status IN ('COMPLETED','FAILED')),
  ADD CONSTRAINT sp_simulated_ck CHECK (is_simulated = true);
-- BR-043: exactly one completed primary payment per invoice.
CREATE UNIQUE INDEX sp_one_primary_uq ON simulated_payments (invoice_id) WHERE kind = 'PRIMARY' AND status = 'COMPLETED';

ALTER TABLE simulated_refunds
  ADD CONSTRAINT sr_amount_ck CHECK (amount_halalas > 0),
  ADD CONSTRAINT sr_status_ck CHECK (status IN ('SIMULATED_REFUND_INITIATED','SIMULATED_REFUND_COMPLETED')),
  ADD CONSTRAINT sr_source_ck CHECK (source_type IN ('DEAL_CANCELLATION','REASSIGNMENT_PRICE_DIFFERENCE')),
  ADD CONSTRAINT sr_simulated_ck CHECK (is_simulated = true);

-- ── system ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX spv_one_current_uq ON system_policy_versions (is_current) WHERE is_current;

ALTER TABLE scheduled_deadlines
  ADD CONSTRAINT sd_entity_ck CHECK (entity_type IN ('DEAL','SHIPMENT','OFFER_ROUND')),
  ADD CONSTRAINT sd_type_ck CHECK (deadline_type IN ('CARRIER_CONFIRMATION','CARRIER_RETRY','PAYMENT','PICKUP_DEADLINE',
    'CARRIER_RECONFIRM','REASSIGNMENT','DELIVERY_ETA','OFFER_ROUND','PAYMENT_REMINDER','DELIVERED_UNCONFIRMED')),
  ADD CONSTRAINT sd_status_ck CHECK (status IN ('PENDING','DONE','SKIPPED','FAILED'));
CREATE INDEX sd_due_pending_ix ON scheduled_deadlines (due_at) WHERE status = 'PENDING';

ALTER TABLE notifications
  ADD CONSTRAINT notifications_email_ck CHECK (email_status IN ('NOT_REQUIRED','PENDING','SENT','FAILED'));

-- BR-081: audit log is append-only for the application.
ALTER TABLE audit_logs ADD CONSTRAINT audit_actor_ck CHECK (actor_type IN ('USER','SYSTEM','ADMIN'));
CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
CREATE TRIGGER shipment_events_no_update BEFORE UPDATE OR DELETE ON shipment_events
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
