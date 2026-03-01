# Umusare Project Blueprint
You are building a "Designated Driver" platform for Rwanda.

## Tech Stack
- Frontend: React Native (Expo)
- Backend: Supabase (Auth, DB, Realtime)
- Language: TypeScript

## Pricing Rules
- Base Fee (Local < 3km): 6,000 Rwf (includes 1st hour)
- Base Fee (Far > 3km): 15,000 Rwf (includes 1st hour)
- Extra Time: 3,000 Rwf per 30-minute block (after the first hour)

## Logic Requirements
- Arrival: Auto-start waiting timer when driver is within 40m of client.
- Revenue: 15% platform commission tracked via a negative ledger in the driver's wallet.
- Manifest: Generate a digital QR code manifest for police checkpoints.