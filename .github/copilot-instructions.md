# UMUSARE: TECHNICAL SPECIFICATION & PROJECT BLUEPRINT
## 1. PROJECT OVERVIEW
Umusare is a specialized "Designated Driver" platform for the Rwandan market. It connects car owners with professional drivers to operate the owner's vehicle. The goal is to eliminate DUI risks and comply with Rwanda's 2026 Traffic Laws (Demerit Point System).

## 2. CORE ARCHITECTURE
Monorepo Structure: Managed via pnpm.

Apps: - apps/client: React Native (Expo) - For car owners to request drivers.

apps/driver: React Native (Expo) - For professional drivers to accept trips.

Backend: Supabase (PostgreSQL, PostGIS for location, Realtime for tracking, Edge Functions for billing).

Styling: Tailwind CSS (via NativeWind).

## 3. THE BUSINESS LOGIC (STRICT RULES)
A. Dispatch & Pricing Engine
The system must calculate distance between the Driver and Client at the moment of request:

Distance <= 3km (Local): Base Fee = 6,000 Rwf.

Distance > 3km (Far): Base Fee = 15,000 Rwf.

Time Inclusion: The Base Fee covers the first 60 minutes of the session.

Incremental Billing: After the first 60 minutes, charge 3,000 Rwf per 30-minute block.

B. Precision Geofencing (Arrival Logic)
The Driver App must track background location.

Trigger: When the Driver's GPS coordinates are within 40 meters of the Client's coordinates, the "Waiting Timer" starts automatically.

Notification: Send an automated push notification to the Client upon entering the 40m radius.

C. Revenue & Settlement (The Ledger)
Commission: Umusare takes 15% of the total fare.

Negative Balance: Since most payments are Cash or Direct MoMo, the wallets table must store a negative balance for the driver.

Lockout: If a driver's negative balance exceeds a set threshold or is not settled by Sunday midnight, the "Go Online" capability must be disabled.

D. Legal Safety (The Manifest)
Generate a unique Digital Trip Manifest (QR Code) for every active trip.

Manifest must show: Driver Name, License Number, Client Car Plate, and "ACTIVE" status.

Shadow GPS: If a driver ends a trip but the Driver/Client phones stay moving together, flag for "Off-platform leakage."

## 4. DATA MODELS (SUPABASE)
profiles: id, role (enum: driver, client), full_name, phone, rating, verification_status, language_tags (array).

trips: id, client_id, driver_id, base_fee, start_time, end_time, status (enum: pending, arrived, active, completed), final_fare.

wallets: driver_id, balance (decimal), last_settlement_date.

## 5. AI INSTRUCTIONS FOR CODE GENERATION
Always use TypeScript. Define strict interfaces for all data.

Shared Logic: Keep billing calculations in packages/shared-logic so both apps use the same math.

Security: Use Supabase RLS (Row Level Security) so drivers cannot see other drivers' earnings.

UI: Focus on a clean, "VIP" aesthetic using dark modes or deep blues (Royal Rwanda branding).