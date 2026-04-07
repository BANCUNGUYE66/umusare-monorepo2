# umusare-monorepo

🚕 Umusare Monorepo
Predictive health-tech and ride-hailing platform for East Africa.

🏗 Project Structure
apps/client: Rider app (iPhone 14 Pro Max / iOS).

apps/driver-app: Driver app (iPhone 14 Pro Max / iOS).

packages/shared-logic: Supabase client, shared types, and fee logic.

🚀 How to Start Working Again
Step 1: The Environment
Ensure your Mac's Local IP is correct in packages/shared-logic/supabaseClient.ts.
Current Dev IP: 192.168.1.68

Step 2: Start the Client (Rider)
Bash
cd apps/client
npx expo start --lan -c
Device: iPhone 14 Pro Max.

Action: Scan QR with Camera app.

Step 3: Start the Driver App
Bash
cd apps/driver-app
npx expo start --lan --port 8082 -c
Device: Android.

Action: Scan QR with Expo Go / Camera.
