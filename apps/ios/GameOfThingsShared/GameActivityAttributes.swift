import ActivityKit

/// The Live Activity that follows one round on the lock screen and Dynamic Island (#71). Compiled
/// into both the app, which starts and updates it, and the widget extension, which draws it.
/// `ContentState` is also what the server pushes (`activityUpdate` in server/pushPayloads.ts), so
/// keep the two in step. Names only: nothing here can give an answer away.
nonisolated struct GameActivityAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable {
        /// Whose turn it is; nil once nobody is left.
        var currentPlayer: String?
        /// Everyone still to be guessed, in turn order (the current player first).
        var remaining: [String]
    }

    let gameId: String
    /// The player this device is, so the activity can say "Your turn".
    let playerName: String
}

extension GameActivityAttributes.ContentState {
    /// "Up next" for the activity: the players after the current one.
    var upNext: [String] { Array(remaining.dropFirst()) }
}
