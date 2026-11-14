# Game of Things — iOS

Native SwiftUI client for the same Express API the web app uses. No third-party dependencies:
REST goes through `URLSession`, and local realtime updates use a small Socket.IO v4 client over
`URLSessionWebSocketTask` (`Networking/RealtimeClient.swift`). Against the production Lambda API,
it falls back to syncing state every three seconds.

## Requirements

- Xcode 26 or later (the project uses file-system-synchronized groups and `MainActor` default isolation)
- iOS 18+

## Running

Open `GameOfThings.xcodeproj` and run the **GameOfThings** scheme.

- **Debug** builds talk to `http://localhost:3001`, so start the server first with `npm run dev`
  (`sst dev`) from the repo root, same as the web client. That works in the Simulator; on a physical
  device, set `API_URL` (e.g. `https://api.gameofthings.fun`) under
  *Scheme → Run → Arguments → Environment Variables*.
- **Release** builds talk to production (`https://api.gameofthings.fun`).

Links like `gameofthings://ABCD` open that game directly (handy in the Simulator:
`xcrun simctl openurl booted gameofthings://ABCD`).

The local server uses your own SST stage's tables, not production's.

## Tests

```sh
xcodebuild test -project apps/ios/GameOfThings.xcodeproj -scheme GameOfThings \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```

## Push notifications and Live Activities

Players get a notification when it is their turn or a new round starts, and a Live Activity on the
lock screen and Dynamic Island shows who is up and who is left. Both are driven by the server
(`server/push.ts`); the app only registers its tokens. The toggle "Notify me on my turn" in a game
opts out of that game (and removes the device from it on the server).

- `GameOfThings/Notifications/` holds the APNs registration and the Live Activity controller.
- `GameOfThingsLiveActivity/` is the widget extension that draws the Live Activity;
  `GameOfThingsShared/GameActivityAttributes.swift` is compiled into both targets and must match
  `server/pushPayloads.ts`.
- Both App IDs (`com.kumprj.GameOfThings` and `com.kumprj.GameOfThings.LiveActivity`) need the Push
  Notifications capability, which Xcode adds when you sign with your team. Push needs a real device;
  the Simulator gets no APNs token.
- Debug builds register against Apple's sandbox gateway, Release builds against production.
