-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "legal_name_ar" TEXT NOT NULL,
    "legal_name_en" TEXT,
    "commercial_registration_no" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "logo_object_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "status_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_licenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "license_type" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "issuing_authority" TEXT NOT NULL,
    "expires_on" DATE,
    "document_object_key" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "primary_activity" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "address_text" TEXT,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factory_sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "address_text" TEXT,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "factory_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "cargo_class" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_listings" (
    "id" UUID NOT NULL,
    "mine_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "physical_state" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'TON',
    "total_quantity" DECIMAL(12,3) NOT NULL,
    "reserved_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "sold_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "asking_price_halalas" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "is_negotiable" BOOLEAN NOT NULL DEFAULT true,
    "loading_conditions" TEXT NOT NULL,
    "available_from" DATE,
    "available_until" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_specifications" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "property_name" TEXT NOT NULL,
    "value_numeric" DECIMAL(18,6),
    "value_text" TEXT,
    "unit" TEXT,
    "verification_status" TEXT NOT NULL,
    "document_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "material_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_documents" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'ON_REQUEST',
    "lab_name" TEXT,
    "issued_on" DATE,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "released_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_offers" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "listing_id" UUID NOT NULL,
    "factory_org_id" UUID NOT NULL,
    "mine_org_id" UUID NOT NULL,
    "delivery_site_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_negotiation_rounds" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "round_no" SMALLINT NOT NULL,
    "proposed_by" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price_halalas" BIGINT NOT NULL,
    "loading_window_start" TIMESTAMPTZ(6),
    "loading_window_end" TIMESTAMPTZ(6),
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" UUID,
    "response_note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_negotiation_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "offer_id" UUID NOT NULL,
    "accepted_round_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "mine_id" UUID NOT NULL,
    "factory_org_id" UUID NOT NULL,
    "mine_org_id" UUID NOT NULL,
    "delivery_site_id" UUID NOT NULL,
    "quantity_tons" DECIMAL(12,3) NOT NULL,
    "unit_price_halalas" BIGINT NOT NULL,
    "material_total_halalas" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "commercial_snapshot" JSONB NOT NULL,
    "loading_window_start" TIMESTAMPTZ(6) NOT NULL,
    "loading_window_end" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CARRIER',
    "agreed_at" TIMESTAMPTZ(6) NOT NULL,
    "carrier_deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "retry_deadline_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "selected_quote_id" UUID,
    "payment_deadline_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "cancellation_note" TEXT,
    "cancellation_fault_party" TEXT,
    "cancelled_by" UUID,
    "policy_version_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_profiles" (
    "organization_id" UUID NOT NULL,
    "fleet_size_total" INTEGER NOT NULL DEFAULT 0,
    "international_capable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "carrier_profiles_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "transportation_modes" (
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "transportation_modes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "code" TEXT NOT NULL,
    "mode_code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "carrier_operating_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location_kind" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "country_code" TEXT NOT NULL DEFAULT 'SA',
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carrier_operating_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_service_areas" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "area_type" TEXT NOT NULL,
    "region_code" TEXT,
    "country_code" TEXT,
    "operating_location_id" UUID,
    "radius_km" DECIMAL(7,1),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mode_code" TEXT NOT NULL,
    "vehicle_type_code" TEXT NOT NULL,
    "supported_cargo_classes" TEXT[],
    "payload_tons_per_vehicle" DECIMAL(8,3) NOT NULL,
    "vehicles_available" INTEGER NOT NULL,
    "min_shipment_tons" DECIMAL(12,3) NOT NULL,
    "max_shipment_tons" DECIMAL(12,3) NOT NULL,
    "includes_loading" BOOLEAN NOT NULL DEFAULT false,
    "includes_unloading" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carrier_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_pricing_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_pricing_rule_versions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "pricing_model" TEXT NOT NULL,
    "base_fee_halalas" BIGINT NOT NULL DEFAULT 0,
    "rate_per_km" DECIMAL(14,4),
    "rate_per_ton" DECIMAL(14,4),
    "rate_per_ton_km" DECIMAL(14,4),
    "fixed_route_price_halalas" BIGINT,
    "route_origin_region" TEXT,
    "route_destination_region" TEXT,
    "distance_basis" TEXT NOT NULL DEFAULT 'PER_SHIPMENT',
    "loading_fee_halalas" BIGINT NOT NULL DEFAULT 0,
    "unloading_fee_halalas" BIGINT NOT NULL DEFAULT 0,
    "handling_fee_halalas" BIGINT NOT NULL DEFAULT 0,
    "fee_basis" TEXT NOT NULL DEFAULT 'FLAT',
    "waiting_fee_per_hour_halalas" BIGINT NOT NULL DEFAULT 0,
    "free_waiting_hours" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "minimum_charge_halalas" BIGINT NOT NULL DEFAULT 0,
    "min_weight_tons" DECIMAL(12,3),
    "max_weight_tons" DECIMAL(12,3),
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_pricing_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_quotes" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "carrier_org_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "pricing_rule_version_id" UUID NOT NULL,
    "operating_location_id" UUID NOT NULL,
    "straight_line_km_to_mine" DECIMAL(8,1) NOT NULL,
    "straight_line_km_mine_to_factory" DECIMAL(8,1) NOT NULL,
    "route_distance_km" DECIMAL(8,1) NOT NULL,
    "distance_band" TEXT NOT NULL,
    "quantity_tons" DECIMAL(12,3) NOT NULL,
    "trips" INTEGER NOT NULL,
    "proposed_pickup_at" TIMESTAMPTZ(6) NOT NULL,
    "estimated_transit_hours" DECIMAL(6,1) NOT NULL,
    "transport_total_halalas" BIGINT NOT NULL,
    "pricing_snapshot" JSONB NOT NULL,
    "terms" TEXT,
    "needs_admin_review" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_reassignment" BOOLEAN NOT NULL DEFAULT false,
    "submitted_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transport_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "carrier_org_id" UUID,
    "active_quote_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CARRIER',
    "pickup_window_start" TIMESTAMPTZ(6) NOT NULL,
    "pickup_window_end" TIMESTAMPTZ(6) NOT NULL,
    "planned_pickup_at" TIMESTAMPTZ(6),
    "pickup_deadline_at" TIMESTAMPTZ(6),
    "original_pickup_deadline_at" TIMESTAMPTZ(6),
    "extension_count" SMALLINT NOT NULL DEFAULT 0,
    "reconfirm_deadline_at" TIMESTAMPTZ(6),
    "reassignment_deadline_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "handover_confirmed_at" TIMESTAMPTZ(6),
    "in_transit_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expected_delivery_at" TIMESTAMPTZ(6),
    "loaded_tons" DECIMAL(12,3),
    "received_tons" DECIMAL(12,3),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_legs" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "leg_no" SMALLINT NOT NULL,
    "mode_code" TEXT NOT NULL,
    "origin_kind" TEXT NOT NULL,
    "origin_id" UUID NOT NULL,
    "destination_kind" TEXT NOT NULL,
    "destination_id" UUID NOT NULL,
    "carrier_org_id" UUID,

    CONSTRAINT "shipment_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_extensions" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "sequence_no" SMALLINT NOT NULL,
    "previous_deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "new_deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_text" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "affected_carrier_org_id" UUID,
    "reconfirmation_status" TEXT NOT NULL,
    "reconfirm_deadline_at" TIMESTAMPTZ(6),
    "reconfirmed_at" TIMESTAMPTZ(6),
    "reconfirmed_by" UUID,
    "decline_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_org_id" UUID,
    "note" TEXT,
    "payload" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "deal_id" UUID NOT NULL,
    "buyer_org_id" UUID NOT NULL,
    "mine_org_id" UUID NOT NULL,
    "carrier_org_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "material_total_halalas" BIGINT NOT NULL,
    "transport_total_halalas" BIGINT NOT NULL,
    "additional_charges_halalas" BIGINT NOT NULL DEFAULT 0,
    "grand_total_halalas" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "payment_status" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "payment_deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,
    "simulation_label" TEXT NOT NULL DEFAULT 'DEMO / SIMULATION — ليست فاتورة ضريبية',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "description_ar" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit_amount_halalas" BIGINT,
    "line_total_halalas" BIGINT NOT NULL,
    "source_quote_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulated_payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "invoice_item_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'PRIMARY',
    "amount_halalas" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "paid_by_user_id" UUID NOT NULL,
    "simulated_reference" TEXT NOT NULL,
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulated_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulated_refunds" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_halalas" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "simulated_reference" TEXT NOT NULL,
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,
    "initiated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "simulated_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_policy_versions" (
    "id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_deadlines" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "deadline_type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("user_id","endpoint","key")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "body_ar" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "link_path" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "email_status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_org_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "ip" TEXT,
    "job_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_type_commercial_registration_no_key" ON "organizations"("type", "commercial_registration_no");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "organization_licenses_organization_id_idx" ON "organization_licenses"("organization_id");

-- CreateIndex
CREATE INDEX "mines_organization_id_idx" ON "mines"("organization_id");

-- CreateIndex
CREATE INDEX "mines_region_code_status_idx" ON "mines"("region_code", "status");

-- CreateIndex
CREATE INDEX "mines_lat_lng_idx" ON "mines"("lat", "lng");

-- CreateIndex
CREATE INDEX "factory_sites_organization_id_idx" ON "factory_sites"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_code_key" ON "material_categories"("code");

-- CreateIndex
CREATE INDEX "material_listings_status_category_id_idx" ON "material_listings"("status", "category_id");

-- CreateIndex
CREATE INDEX "material_listings_mine_id_idx" ON "material_listings"("mine_id");

-- CreateIndex
CREATE INDEX "material_listings_organization_id_idx" ON "material_listings"("organization_id");

-- CreateIndex
CREATE INDEX "material_listings_asking_price_halalas_idx" ON "material_listings"("asking_price_halalas");

-- CreateIndex
CREATE INDEX "material_specifications_listing_id_idx" ON "material_specifications"("listing_id");

-- CreateIndex
CREATE INDEX "material_documents_listing_id_idx" ON "material_documents"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_deal_id_key" ON "inventory_reservations"("deal_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_listing_id_status_idx" ON "inventory_reservations"("listing_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_offers_reference_key" ON "purchase_offers"("reference");

-- CreateIndex
CREATE INDEX "purchase_offers_mine_org_id_status_idx" ON "purchase_offers"("mine_org_id", "status");

-- CreateIndex
CREATE INDEX "purchase_offers_factory_org_id_status_idx" ON "purchase_offers"("factory_org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "offer_negotiation_rounds_offer_id_round_no_key" ON "offer_negotiation_rounds"("offer_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "deals_reference_key" ON "deals"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "deals_offer_id_key" ON "deals"("offer_id");

-- CreateIndex
CREATE INDEX "deals_factory_org_id_status_idx" ON "deals"("factory_org_id", "status");

-- CreateIndex
CREATE INDEX "deals_mine_org_id_status_idx" ON "deals"("mine_org_id", "status");

-- CreateIndex
CREATE INDEX "deals_status_carrier_deadline_at_idx" ON "deals"("status", "carrier_deadline_at");

-- CreateIndex
CREATE INDEX "carrier_operating_locations_organization_id_is_active_idx" ON "carrier_operating_locations"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "carrier_operating_locations_lat_lng_idx" ON "carrier_operating_locations"("lat", "lng");

-- CreateIndex
CREATE INDEX "carrier_service_areas_region_code_idx" ON "carrier_service_areas"("region_code");

-- CreateIndex
CREATE UNIQUE INDEX "carrier_service_areas_organization_id_area_type_region_code_key" ON "carrier_service_areas"("organization_id", "area_type", "region_code");

-- CreateIndex
CREATE INDEX "carrier_services_organization_id_is_active_idx" ON "carrier_services"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "carrier_pricing_rules_service_id_idx" ON "carrier_pricing_rules"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "carrier_pricing_rule_versions_rule_id_version_no_key" ON "carrier_pricing_rule_versions"("rule_id", "version_no");

-- CreateIndex
CREATE INDEX "transport_quotes_deal_id_status_idx" ON "transport_quotes"("deal_id", "status");

-- CreateIndex
CREATE INDEX "transport_quotes_carrier_org_id_status_idx" ON "transport_quotes"("carrier_org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_deal_id_key" ON "shipments"("deal_id");

-- CreateIndex
CREATE INDEX "shipments_carrier_org_id_status_idx" ON "shipments"("carrier_org_id", "status");

-- CreateIndex
CREATE INDEX "shipments_status_pickup_deadline_at_idx" ON "shipments"("status", "pickup_deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_legs_shipment_id_leg_no_key" ON "shipment_legs"("shipment_id", "leg_no");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_extensions_shipment_id_sequence_no_key" ON "shipment_extensions"("shipment_id", "sequence_no");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_reference_key" ON "invoices"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_deal_id_key" ON "invoices"("deal_id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "simulated_payments_simulated_reference_key" ON "simulated_payments"("simulated_reference");

-- CreateIndex
CREATE UNIQUE INDEX "simulated_payments_invoice_id_idempotency_key_key" ON "simulated_payments"("invoice_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "simulated_refunds_simulated_reference_key" ON "simulated_refunds"("simulated_reference");

-- CreateIndex
CREATE UNIQUE INDEX "simulated_refunds_invoice_id_source_type_source_id_key" ON "simulated_refunds"("invoice_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_policy_versions_version_no_key" ON "system_policy_versions"("version_no");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_deadlines_entity_type_entity_id_deadline_type_seq_key" ON "scheduled_deadlines"("entity_type", "entity_id", "deadline_type", "sequence");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_is_read_created_at_idx" ON "notifications"("recipient_user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_org_id_occurred_at_idx" ON "audit_logs"("actor_org_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_licenses" ADD CONSTRAINT "organization_licenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mines" ADD CONSTRAINT "mines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_sites" ADD CONSTRAINT "factory_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_listings" ADD CONSTRAINT "material_listings_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_listings" ADD CONSTRAINT "material_listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_specifications" ADD CONSTRAINT "material_specifications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "material_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_specifications" ADD CONSTRAINT "material_specifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "material_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_documents" ADD CONSTRAINT "material_documents_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "material_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "material_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_offers" ADD CONSTRAINT "purchase_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "material_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_offers" ADD CONSTRAINT "purchase_offers_delivery_site_id_fkey" FOREIGN KEY ("delivery_site_id") REFERENCES "factory_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_negotiation_rounds" ADD CONSTRAINT "offer_negotiation_rounds_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "purchase_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "purchase_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_accepted_round_id_fkey" FOREIGN KEY ("accepted_round_id") REFERENCES "offer_negotiation_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "material_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_mine_id_fkey" FOREIGN KEY ("mine_id") REFERENCES "mines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_delivery_site_id_fkey" FOREIGN KEY ("delivery_site_id") REFERENCES "factory_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "system_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_selected_quote_id_fkey" FOREIGN KEY ("selected_quote_id") REFERENCES "transport_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_profiles" ADD CONSTRAINT "carrier_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_mode_code_fkey" FOREIGN KEY ("mode_code") REFERENCES "transportation_modes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_operating_locations" ADD CONSTRAINT "carrier_operating_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_service_areas" ADD CONSTRAINT "carrier_service_areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_services" ADD CONSTRAINT "carrier_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_services" ADD CONSTRAINT "carrier_services_mode_code_fkey" FOREIGN KEY ("mode_code") REFERENCES "transportation_modes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_services" ADD CONSTRAINT "carrier_services_vehicle_type_code_fkey" FOREIGN KEY ("vehicle_type_code") REFERENCES "vehicle_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_pricing_rules" ADD CONSTRAINT "carrier_pricing_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_pricing_rules" ADD CONSTRAINT "carrier_pricing_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "carrier_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_pricing_rule_versions" ADD CONSTRAINT "carrier_pricing_rule_versions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "carrier_pricing_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "carrier_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_pricing_rule_version_id_fkey" FOREIGN KEY ("pricing_rule_version_id") REFERENCES "carrier_pricing_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_quotes" ADD CONSTRAINT "transport_quotes_operating_location_id_fkey" FOREIGN KEY ("operating_location_id") REFERENCES "carrier_operating_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_active_quote_id_fkey" FOREIGN KEY ("active_quote_id") REFERENCES "transport_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_legs" ADD CONSTRAINT "shipment_legs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_extensions" ADD CONSTRAINT "shipment_extensions_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_payments" ADD CONSTRAINT "simulated_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_payments" ADD CONSTRAINT "simulated_payments_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_refunds" ADD CONSTRAINT "simulated_refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
