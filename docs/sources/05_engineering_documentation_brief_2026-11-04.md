# MASTER ENGINEERING DOCUMENTATION PROMPT — MAKNAZ

## ROLE AND RESPONSIBILITY

You are acting as the Principal Software Architect, Lead Software Engineer, Senior Systems Analyst, Database Architect, and Technical Product Owner for MAKNAZ.

Your responsibility is to transform the approved business concept and requirements into a comprehensive, technically rigorous, implementation-ready Software Requirements Specification (SRS) and supporting engineering documentation.

Think and work at the standard expected from a senior engineering team designing a serious B2B industrial marketplace and logistics orchestration platform.

The deliverable must be detailed enough that frontend engineers, backend engineers, database engineers, QA engineers, and UI/UX designers can independently understand their responsibilities and implement the system consistently.

This is an engineering documentation task.

**DO NOT begin coding the application.**

**DO NOT install dependencies, initialize a framework, create database migrations, or deploy anything.**

Your job is to finish the architecture and requirements documentation first.

---

# 1. PROJECT IDENTITY

Project Name: مَكْنَز

English Name: MAKNAZ

Tagline: HIDDEN RESOURCES. NEW VALUE.

Project Type:

B2B Mining By-Products Marketplace and Logistics Orchestration Platform.

Target Market:

Saudi Arabia initially, with potential expansion to international industrial buyers.

## Project Concept

MAKNAZ is a specialized digital marketplace connecting mining operations that possess underutilized mining by-products or residual materials with industrial facilities that may use these materials as production inputs.

The platform also connects buyers and mines with transportation providers.

MAKNAZ manages:

- Mining company registration.
- Mine locations and material listings.
- Industrial buyer registration.
- Material discovery and evaluation.
- Purchase offers and price negotiation.
- Carrier discovery and geographic matching.
- Transportation service registration.
- Carrier pricing and logistics cost calculations.
- Three-party transaction confirmation.
- Simulated invoices and payments.
- Shipment scheduling.
- Shipment deadline extensions.
- Shipment status management.
- Automatic cancellation policies.
- Simulated refunds.
- Administrative oversight.

The project is not simply an online store.

It combines industrial material trading with logistics coordination and transaction management.

However, it must not claim to determine chemical composition without actual laboratory evidence, guarantee material suitability, or independently authorize the transportation of regulated waste.

---

# 2. MANDATORY INITIAL INSPECTION

Before writing the documentation:

1. Inspect the current repository structure.
2. Read all existing MAKNAZ-related documents.
3. Locate any existing:
   - Product concept documents.
   - Software requirements.
   - Business requirements.
   - Technical specifications.
   - Database schemas.
   - UI/UX documentation.
   - Architecture diagrams.
   - Existing implementation files.
4. Treat approved business decisions in the supplied context as authoritative.
5. Identify contradictions between existing documents and newer approved decisions.
6. Prioritize the latest explicitly approved decisions.
7. Preserve existing project files and avoid unnecessary modifications.

If the existing repository does not contain sufficient information, use the detailed requirements in this prompt.

Do not fabricate integrations, business partnerships, customer data, actual transport prices, or regulatory approvals.

Distinguish between:

- APPROVED REQUIREMENTS
- ENGINEERING RECOMMENDATIONS
- ASSUMPTIONS
- OPEN DECISIONS
- FUTURE ENHANCEMENTS

Do not silently convert recommendations into approved requirements.

---

# 3. REQUIRED DELIVERABLES

Create the following directory structure:

```text
docs/
├── MAKNAZ_SRS.md
├── ARCHITECTURE.md
├── RBAC_MATRIX.md
├── USE_CASES.md
├── DATABASE_DESIGN.md
├── TRANSACTION_STATE_MACHINE.md
├── API_SPECIFICATION.md
├── BUSINESS_RULES.md
├── UI_UX_REQUIREMENTS.md
├── TEST_STRATEGY.md
├── MVP_ROADMAP.md
└── OPEN_DECISIONS.md
```

The main document, `MAKNAZ_SRS.md`, must be comprehensive and independently understandable.

Supporting documents must expand on the relevant sections instead of contradicting or simply duplicating them.

Use relative Markdown links so developers can navigate between the files.

Write the business explanations and user-facing feature descriptions in professional Arabic.

Use English for established technical terminology, database entities, API paths, state identifiers, and code examples where appropriate.

Ensure that Arabic Markdown content remains readable and correctly structured.

---

# 4. SYSTEM USERS AND RESPONSIBILITIES

The system has four primary organizational user types.

## USER 1 — FACTORY / INDUSTRIAL BUYER

The factory is an organization seeking industrial materials that may be available as mining by-products.

### Required capabilities

The factory must be able to:

1. Register an organization account.
2. Manage its company profile.
3. Register its factory location.
4. Browse registered mines.
5. View mine locations and available materials.
6. Search materials by category, type, quantity, price, and region.
7. Open detailed material profiles.
8. View available specifications and permitted laboratory documents.
9. View the mine's initial asking price.
10. Select the required quantity.
11. Submit a purchase offer with a proposed price.
12. Track offer status.
13. Receive counteroffers from the mine.
14. Accept or reject counteroffers.
15. View suitable transportation providers.
16. Compare transportation prices and estimated durations.
17. View material cost, logistics cost, and total transaction cost separately.
18. Follow the three-party confirmation process.
19. View a simulated invoice.
20. Execute a simulated payment after all three parties have confirmed.
21. Track shipment progress.
22. Receive shipment delay and extension notifications.
23. View updated shipment dates.
24. Confirm receipt of the material.
25. View completed, cancelled, and active transactions.
26. View simulated refund status when applicable.

### Permission restrictions

A factory must not be allowed to:

- Modify mining company material listings.
- Modify transport provider prices.
- Accept purchase offers on behalf of a mine.
- Extend shipment deadlines.
- Access confidential data belonging to other organizations.
- Modify confirmed transaction prices.
- Mark a shipment as transported on behalf of a carrier.

Define the exact permissions and ownership rules.

---

## USER 2 — MINE / MINING COMPANY

The mine is the supplier of mining by-products and residual materials.

### Required capabilities

The mining company must be able to:

1. Register a company account.
2. Register one or multiple mine locations.
3. Enter geographical locations.
4. Manage mine profiles.
5. Specify primary mining operations.
6. Register available mining by-products.
7. Specify material categories.
8. Enter quantities and measurement units.
9. Enter initial asking prices.
10. Describe material properties.
11. Upload laboratory analysis reports when available.
12. Identify unknown or unverified material properties.
13. Update available quantities.
14. Manage active and inactive material listings.
15. Receive factory purchase offers.
16. Accept purchase offers.
17. Reject purchase offers.
18. Submit counteroffers.
19. View confirmed commercial agreements.
20. Review transportation arrangements.
21. Schedule shipment preparation.
22. Specify pickup dates and times.
23. Extend shipment deadlines.
24. View shipment and transaction history.
25. Receive notifications.
26. View simulated invoices and payments.

### Approved shipment extension policy

The mine has exclusive authority to extend shipment dates.

The factory must not be required to approve the extension.

The carrier must not have authority to prevent the mine from changing the deadline.

However, the carrier's operational availability for the newly scheduled date must be reconfirmed when necessary.

The system must distinguish:

- The mine's authority to change the shipment deadline.
- The carrier's operational commitment to fulfill the new schedule.

Approved defaults:

- Maximum extensions: 2.
- Maximum extension per request: 72 hours.
- Extension reason: required.
- Notifications: mandatory.
- Audit trail: mandatory.

Design the complete behavior for failed carrier reconfirmation without assuming that extending the deadline automatically guarantees transportation capacity.

### Permission restrictions

The mine must not be allowed to:

- Modify another mine's materials.
- Change an accepted transaction price unilaterally.
- Modify a carrier's transportation tariffs.
- Record payment on behalf of the factory.
- Confirm receipt on behalf of the factory.

---

## USER 3 — TRANSPORTATION COMPANY / CARRIER

Transportation providers participate in transporting materials between mines and factories, including international shipping when supported.

### Required capabilities

A carrier must be able to:

1. Register a transportation company.
2. Manage company information.
3. Register one or more operational locations.
4. Register geographic service areas.
5. Specify available transportation modes.
6. Specify supported cargo types.
7. Specify vehicle categories.
8. Define loading capacity.
9. Define minimum and maximum shipment weights.
10. Configure pricing rules.
11. View nearby mines.
12. View eligible shipment opportunities.
13. Filter shipment opportunities by region and distance.
14. Review cargo details and loading requirements.
15. Calculate transportation prices.
16. Accept or reject a shipment assignment.
17. Confirm the quoted price.
18. Confirm the proposed pickup date.
19. Track assigned shipments.
20. Update shipment statuses.
21. Receive shipment extension notifications.
22. Reconfirm operational availability when the mine changes the pickup date.
23. View historical and current transportation commitments.

### Geographic matching

Every transportation company must specify its operational locations.

Do not assume the administrative headquarters is the dispatch location.

Use operational fleet locations for matching.

Prioritize providers near the mine.

Recommended initial distance bands:

- 0–50 km.
- 51–150 km.
- 151–300 km.
- More than 300 km.

These are configurable engineering defaults, not approved transportation regulations.

Geographic proximity must not override:

- Cargo compatibility.
- Service availability.
- Transportation restrictions.
- Capacity.
- Supported transportation modes.

Differentiate straight-line geographic distance from actual road, rail, or sea route distance.

Never label straight-line distance as an actual driving distance.

### Transportation modes

The platform must support a data model for:

- Road transportation by trucks.
- Rail transportation.
- Maritime transportation.
- Multimodal transportation.

For road transportation, support vehicle categories such as:

- Dump trucks.
- Bulk trailers.
- Flatbed trucks.
- Container trucks.
- Specialized industrial vehicles.

Do not assume every carrier supports every mode.

---

# 5. TRANSPORT PRICING ENGINE

Design a flexible transportation pricing system controlled by the transportation company.

### Supported pricing inputs

- Transportation mode.
- Vehicle category.
- Cargo type.
- Distance.
- Weight.
- Base rate.
- Price per kilometer.
- Price per ton.
- Price per ton-kilometer.
- Fixed route price.
- Loading fees.
- Unloading fees.
- Handling fees.
- Waiting fees.
- Minimum order amount.
- Minimum shipment weight.
- Maximum load capacity.
- Geographic service area.
- Applicable price validity period.

### Pricing models

Support multiple explicitly selected formulas.

Example:

Distance pricing:

`transport_cost = distance_km × rate_per_km + additional_fees`

Weight pricing:

`transport_cost = weight_tons × rate_per_ton + additional_fees`

Ton-kilometer pricing:

`transport_cost = weight_tons × distance_km × rate_per_ton_km + additional_fees`

Fixed route pricing:

`transport_cost = fixed_route_price + applicable_fees`

Do not incorrectly add different tariff models together unless the carrier explicitly configured a combined pricing formula.

### Important behavior

Transportation companies must be able to update their rates.

Changes to pricing must not retroactively modify confirmed transaction prices.

A confirmed transportation offer must preserve an immutable pricing snapshot.

Define:

- PricingRule.
- PricingRuleVersion.
- TransportQuote.
- QuoteStatus.
- QuoteExpiration.
- PricingSnapshot.
- ShipmentPrice.
- AdditionalFees.

Include validation, calculations, rounding, currency handling, and edge cases.

---

# 6. PURCHASE OFFERS AND NEGOTIATION

The mine sets an initial asking price.

The factory can submit a different purchase price.

The mine can:

- Accept the offer.
- Reject the offer.
- Submit a counteroffer.

The factory can:

- Accept a counteroffer.
- Reject a counteroffer.

Design a complete negotiation workflow.

Important requirements:

- Every offer has a unique identifier.
- Every offer belongs to a factory and material listing.
- Every offer specifies quantity and unit price.
- All negotiation rounds must be preserved.
- The latest negotiated price must be identifiable.
- An expired offer cannot be accepted.
- Confirmed commercial prices must not change unexpectedly.
- Inventory reservations must prevent overselling.
- Concurrent purchase requests must be handled safely.

Explain precisely when inventory is reserved and released.

Recommended behavior:

Reserve inventory when the mine accepts an offer, not merely when the factory submits it.

Treat this as a recommendation requiring explicit marking unless approved in existing project documentation.

---

# 7. THREE-PARTY TRANSACTION CONFIRMATION

This is a critical approved business requirement.

A transaction involves:

1. The factory.
2. The mine.
3. The transportation company.

### Approved transaction sequence

1. Factory submits an offer.
2. Mine negotiates or accepts.
3. Mine acceptance creates a preliminary commercial agreement.
4. A suitable carrier accepts the shipment.
5. Carrier confirms transportation availability and cost.
6. All three parties are considered commercially confirmed.
7. The simulated invoice becomes available.
8. The factory performs the simulated payment.
9. Shipment preparation and transportation proceed.
10. Delivery is confirmed.
11. Transaction is completed.

**The factory must not pay before all three parties have confirmed.**

Design conditions that prevent invalid state transitions.

Clarify how the system handles multiple interested carriers and the final carrier-selection rule.

Do not silently assume that the first carrier must always win.

---

# 8. SIMULATED INVOICING AND PAYMENTS

The MVP will use simulated payments.

There must be:

- No real money transfers.
- No payment card processing.
- No payment gateway dependency.
- No real escrow.
- No real bank refunds.

Create a complete simulated financial workflow.

### Simulated invoice fields

- Invoice reference.
- Related transaction.
- Buyer details.
- Mine details.
- Material name.
- Quantity.
- Material price per unit.
- Total material price.
- Transportation price.
- Additional charges.
- Final total.
- Date.
- Payment status.
- Clearly visible DEMO / SIMULATION label.

The platform must distinguish:

- Invoice generated.
- Payment pending.
- Simulated payment completed.
- Simulated refund initiated.
- Simulated refund completed.
- Payment expired.

Specify:

- Idempotency.
- Prevention of duplicate payment.
- Refund eligibility.
- Invoice snapshots.
- Audit logs.
- Payment status transitions.

Do not describe simulated invoices as legally valid tax invoices.

---

# 9. SHIPMENT MANAGEMENT

Design the full shipment lifecycle.

Suggested states:

- PENDING_CARRIER
- CARRIER_CONFIRMED
- SCHEDULED
- RECONFIRM_REQUIRED
- READY_FOR_PICKUP
- PICKED_UP
- IN_TRANSIT
- DELIVERED
- COMPLETED
- CANCELLED
- DELAYED

Explain:

- Who can trigger each transition.
- Preconditions.
- Required data.
- Notifications.
- Failure conditions.
- State invariants.
- Compensation actions.

The mine exclusively controls deadline extensions.

The carrier controls its own transport execution updates.

The factory confirms final receipt.

Include operational safeguards for shipments already in transit.

---

# 10. DEADLINES AND AUTOMATIC CANCELLATION

Approved default rules:

| Rule | Value |
|---|---|
| Carrier acceptance deadline | 24 hours |
| Retry period when no carrier accepts | Additional 24 hours |
| Maximum shipment extensions | 2 |
| Maximum time per extension | 72 hours |
| Simulated payment deadline | 24 hours |
| Shipment grace period | 2 hours |
| Automatic cancellation | Enabled |

The previously suggested 12-hour factory approval period for shipment extensions is no longer applicable.

The mine controls extensions without factory approval.

### Required engineering considerations

- Background scheduling.
- Deadline calculation.
- Time zones.
- UTC timestamp storage.
- Automatic cancellation.
- Preventing duplicate cancellation.
- Releasing reserved material quantities.
- Simulated refunds.
- Carrier reassignment.
- Race conditions.
- Exceptions for shipments already in transit.
- Audit logs.

The MVP may use centrally configured values.

**Do not build an Admin Settings UI for changing these values yet.**

That administrative feature is deferred to a later release.

The architecture must support adding it later without redesigning transaction logic.

---

# 11. COMPLETE RBAC MATRIX

Create a dedicated `RBAC_MATRIX.md`.

The matrix must contain all significant operations.

For each operation, specify:

- Factory permission.
- Mine permission.
- Carrier permission.
- Admin permission.
- Resource ownership requirement.
- Allowed transaction states.
- API enforcement requirements.

Do not rely only on frontend permission checks.

Define security cases involving:

- Unauthorized record access.
- Cross-organization access.
- Privilege escalation.
- Manipulation of prices.
- Unauthorized shipment extensions.
- Access to private laboratory documents.
- Unauthorized invoice downloads.

Clearly distinguish Role-Based Access Control from resource ownership checks.

---

# 12. USE CASE SPECIFICATIONS

Create detailed use cases using a consistent professional template.

Every use case must include:

- Use Case ID.
- Name.
- Primary actor.
- Supporting actors.
- Description.
- Trigger.
- Preconditions.
- Main success scenario.
- Alternative scenarios.
- Exception scenarios.
- Postconditions.
- Business rules.
- Permissions.
- Data involved.
- Acceptance criteria.

At minimum, cover:

- Company registration.
- Mine registration.
- Material listing.
- Material search.
- Purchase offer.
- Counteroffer.
- Offer rejection.
- Commercial acceptance.
- Geographic carrier discovery.
- Transportation quote calculation.
- Carrier confirmation.
- Invoice generation.
- Simulated payment.
- Shipment scheduling.
- Shipment extension.
- Carrier reconfirmation.
- Pickup confirmation.
- Delivery confirmation.
- Transaction cancellation.
- Simulated refund.
- Administrative approval.

Give each use case a stable identifier.

---

# 13. DATABASE DESIGN

Create a detailed relational database design.

Use PostgreSQL as the reference relational model unless the existing repository already contains an approved alternative.

At minimum, evaluate the need for:

- Users.
- Organizations.
- OrganizationMembers.
- OrganizationRoles.
- Mines.
- MineLocations.
- MaterialListings.
- MaterialCategories.
- MaterialSpecifications.
- MaterialDocuments.
- MaterialInventory.
- PurchaseOffers.
- OfferNegotiationRounds.
- Deals.
- CarrierProfiles.
- CarrierOperatingLocations.
- CarrierServiceAreas.
- CarrierServices.
- VehicleTypes.
- TransportationModes.
- CarrierPricingRules.
- CarrierPricingVersions.
- TransportQuotes.
- Shipments.
- ShipmentExtensions.
- ShipmentEvents.
- ShipmentLegs.
- Invoices.
- InvoiceItems.
- SimulatedPayments.
- SimulatedRefunds.
- Notifications.
- AuditLogs.
- SystemPolicyVersions.

For every relevant table specify:

1. Purpose.
2. Primary key.
3. Column names.
4. Data types.
5. Nullable fields.
6. Default values.
7. Foreign keys.
8. Unique constraints.
9. Check constraints.
10. Index recommendations.
11. Relationships.
12. Ownership and access considerations.

Provide a Mermaid ERD.

Explain transaction consistency and inventory reservation.

Do not create redundant tables without justification.

---

# 14. STATE MACHINES

Create `TRANSACTION_STATE_MACHINE.md`.

Include separate state machines for:

- Purchase offers.
- Negotiation.
- Deals.
- Carrier confirmations.
- Shipments.
- Simulated payments.
- Simulated refunds.

Use Mermaid state diagrams.

Every transition must specify:

- Trigger.
- Actor.
- Preconditions.
- Resulting status.
- Side effects.
- Notifications.
- Failure handling.

Include special treatment for:

- Concurrent offer acceptance.
- Carrier timeout.
- Shipment deadline extension.
- Carrier unavailability.
- Payment expiration.
- Cancellation after simulated payment.
- Shipment already in transit.
- Failed or repeated scheduled jobs.

Avoid impossible or contradictory state transitions.

---

# 15. API SPECIFICATION

Create a complete REST API specification.

For every endpoint include:

- HTTP method.
- URL.
- Purpose.
- Required role.
- Resource ownership requirements.
- Request schema.
- Response schema.
- Validation rules.
- Error responses.
- Relevant transaction state requirements.

Include endpoint groups for:

- Authentication.
- Organizations.
- Mines.
- Materials.
- Documents.
- Offers.
- Negotiation.
- Deals.
- Carriers.
- Carrier pricing.
- Geographic matching.
- Transport quotes.
- Shipments.
- Shipment extensions.
- Invoices.
- Simulated payments.
- Notifications.
- Administration.

Use consistent naming conventions.

Include representative JSON examples.

Define pagination, filtering, sorting, and error formats.

Use idempotency keys for critical transaction actions.

---

# 16. SOFTWARE ARCHITECTURE

Create `ARCHITECTURE.md`.

Recommend a practical architecture suitable for a small engineering team building an MVP under time pressure.

Favor a well-organized modular monolith unless there is a concrete reason to introduce microservices.

Evaluate:

- Frontend application.
- Backend API.
- Authentication and authorization.
- Database.
- File storage.
- Transaction module.
- Pricing engine.
- Geographic matching module.
- Shipment management.
- Background jobs.
- Notifications.
- Simulated billing.
- Logging and monitoring.

Provide:

1. High-level system architecture.
2. Component responsibilities.
3. Module boundaries.
4. Data flow.
5. Deployment considerations.
6. Security boundaries.
7. Error handling.
8. Future scalability strategy.

Use Mermaid architecture or flow diagrams where useful.

Explain technology recommendations and their tradeoffs.

Do not select frameworks merely because they are fashionable.

---

# 17. UI AND UX SPECIFICATION

Create `UI_UX_REQUIREMENTS.md`.

Define every required screen.

For each screen include:

- Screen identifier.
- Target user.
- Purpose.
- Required components.
- Data displayed.
- Available actions.
- Form fields.
- Validation.
- Loading state.
- Empty state.
- Error state.
- Success state.
- Responsive behavior.

The interface must support Arabic RTL.

Use the existing MAKNAZ branding where available.

Core brand colors:

- Charcoal: #25292B
- Mineral Gray: #858D8E
- Burnished Copper: #B8734F
- Mineral Sand: #E9E5DD
- Off-White: #F7F6F1

Do not redesign an existing logo.

Distinguish verified information from estimates.

Always display simulation indicators for demonstration-only financial operations.

---

# 18. NON-FUNCTIONAL REQUIREMENTS

Define measurable requirements for:

- Security.
- Privacy.
- Availability.
- Performance.
- Scalability.
- Accessibility.
- Reliability.
- Data integrity.
- Auditability.
- Maintainability.
- Error recovery.
- Backup and recovery.
- Testing.
- Browser compatibility.
- Responsive design.
- Arabic text rendering.

Use testable acceptance criteria rather than vague adjectives.

Address concurrency and financial-state consistency, even though payments are simulated.

---

# 19. TESTING STRATEGY

Create `TEST_STRATEGY.md`.

Include:

- Unit tests.
- Integration tests.
- API tests.
- Authorization tests.
- Database constraint tests.
- Transaction state-machine tests.
- Concurrent purchase tests.
- Carrier matching tests.
- Pricing calculation tests.
- Shipment extension tests.
- Automatic cancellation tests.
- Simulated payment tests.
- Simulated refund tests.
- End-to-end user journeys.

Define positive, negative, and edge cases.

Prioritize preventing:

- Overselling inventory.
- Unauthorized edits.
- Duplicate payments.
- Duplicate invoices.
- Incorrect refunds.
- Invalid shipment transitions.
- Incorrect transport pricing.
- Unexpected modification of confirmed prices.

---

# 20. MVP DELIVERY PLAN

Create an implementation roadmap for an eight-day MVP.

Organize the plan into:

- Development phases.
- Dependencies.
- Milestones.
- Deliverables.
- Acceptance checkpoints.
- Risk areas.

Identify critical-path features.

Separate:

- Must Have.
- Should Have.
- Could Have.
- Post-MVP.

Be realistic about complexity.

Do not assume that sophisticated payment, geographic routing, international shipping, or external integrations can be fully implemented without additional dependencies.

Create a reasonable assignment plan for a small team that includes software engineering, UI/UX, and business development.

---

# 21. ENGINEERING QUALITY REQUIREMENTS

The documentation must be:

- Complete.
- Internally consistent.
- Technically accurate.
- Implementation-oriented.
- Testable.
- Traceable.
- Easy for developers to navigate.
- Explicit about assumptions.
- Consistent with the latest approved decisions.

Use stable requirement IDs such as:

- FR-001
- FR-002
- NFR-001
- BR-001
- UC-001

Create a requirements traceability matrix mapping important business requirements to use cases, database entities, API endpoints, and tests.

Never describe an undefined behavior as implemented.

Never invent confirmed commercial relationships, real companies as users, actual pricing agreements, or live transaction data.

---

# 22. FINAL DOCUMENTATION REVIEW

After generating all documents, perform a complete engineering audit.

Verify:

1. Every primary user has a complete set of documented capabilities.
2. Every role has appropriate restrictions.
3. Every critical business operation has a use case.
4. Every use case maps to required data entities.
5. Every critical action has an API contract or explicit implementation boundary.
6. All transaction states have valid transitions.
7. All deadlines and cancellations are internally consistent.
8. Shipment extensions belong exclusively to the mine.
9. Carrier reconfirmation does not contradict the mine's extension authority.
10. Payment occurs only after three-party confirmation.
11. All payments and refunds are simulated.
12. Transportation pricing is configurable by each carrier.
13. Confirmed prices are preserved in transaction snapshots.
14. Geographic carrier matching considers operating location and cargo compatibility.
15. Admin policy editing is marked as post-MVP.
16. No unsupported AI, chemical-analysis, or regulatory claims are introduced.
17. No duplicate or contradictory requirements remain.
18. All referenced Markdown files and diagram syntax are valid.

If contradictions are found, resolve them only when an approved business rule makes the resolution unambiguous.

Otherwise, document the conflict under `OPEN_DECISIONS.md`.

---

# 23. EXECUTION INSTRUCTIONS

Work autonomously on the documentation.

Do not stop after outlining the files.

Create every required document with substantive content.

Do not fill documents with generic boilerplate or repetitive explanations.

Use precise domain terminology.

Prioritize technical consistency over document length.

If there is a better engineering structure than the suggested one, explain the decision while preserving the approved business behavior.

Do not modify application source code.

Do not start application development.

Do not deploy anything.

When finished:

1. List every generated document.
2. Summarize its purpose.
3. Report the number of documented functional and non-functional requirements.
4. Report the number of use cases.
5. Identify unresolved decisions.
6. Identify major implementation risks.
7. Confirm whether the documentation is ready for stakeholder review.

**The final objective is to produce a complete engineering blueprint for MAKNAZ that an implementation team can follow without guessing how the marketplace, negotiation, transportation, payment simulation, scheduling, and cancellation workflows should behave.**

Begin by inspecting the project and existing documentation, then create the full documentation package.