# Game of Things — iOS

Native SwiftUI client for the same Express + Socket.IO server the web app uses.
No third-party dependencies: REST goes through `URLSession`, and realtime updates use a
small Socket.IO v4 client over `URLSessionWebSocketTask` (`Networking/RealtimeClient.swift`).

## Requirements

- Xcode 26 or later (the project uses file-system-synchronized groups and `MainActor` default isolation)
- iOS 18+

## Running

Open `GameOfThings.xcodeproj` and run the **GameOfThings** scheme.

- **Debug** builds talk to `http://localhost:3001`, so start the server first with `npm run dev`
  from the repo root (same as the web client). That works in the Simulator; on a physical
  device, set `API_URL` (e.g. `https://game-of-thingies.onrender.com`) under
  *Scheme → Run → Arguments → Environment Variables*.
- **Release** builds talk to production (`https://game-of-thingies.onrender.com`).

Note that the local server reads and writes the production DynamoDB tables.

## Tests

```sh
xcodebuild test -project apps/ios/GameOfThings.xcodeproj -scheme GameOfThings \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```
