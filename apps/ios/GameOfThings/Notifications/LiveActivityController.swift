import ActivityKit
import Foundation

/// What a Live Activity should show right now: nil means there should be none.
struct TurnActivityState: Equatable {
    let gameId: String
    let playerName: String
    let content: GameActivityAttributes.ContentState
}

/// The part of the Live Activity the game store drives, so tests can swap in a spy.
protocol TurnActivityPublishing: AnyObject {
    /// Called with the activity's push token (hex) whenever ActivityKit issues one.
    var onPushToken: ((String) -> Void)? { get set }
    func publish(_ state: TurnActivityState?)
}

/// Keeps one Live Activity in step with the game (#71). It is started while the player has the game
/// open; after that the server's pushes keep it current even with the app in the background.
final class LiveActivityController: TurnActivityPublishing {
    var onPushToken: ((String) -> Void)?
    /// Updates run one after another so a slow one can't land after a newer one.
    private var queue: Task<Void, Never>?

    func publish(_ state: TurnActivityState?) {
        let previous = queue
        queue = Task { [weak self] in
            await previous?.value
            await Self.apply(state) { token in
                Task { @MainActor in self?.onPushToken?(token) }
            }
        }
    }

    // Off the main actor: ActivityKit's async calls can't take an activity that main-actor code holds.
    private nonisolated static func apply(_ state: TurnActivityState?,
                                          onToken: @escaping @Sendable (String) -> Void) async {
        guard let state else {
            await end()
            return
        }
        let content = ActivityContent(state: state.content, staleDate: nil)
        // ActivityKit remembers running activities across app launches, so ask it rather than keep one.
        if let running = Activity<GameActivityAttributes>.activities.first(where: { $0.attributes.gameId == state.gameId }) {
            await running.update(content)
            return
        }
        await end()
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            let started = try Activity.request(
                attributes: GameActivityAttributes(gameId: state.gameId, playerName: state.playerName),
                content: content, pushType: .token)
            Task {
                for await token in started.pushTokenUpdates {
                    onToken(token.map { String(format: "%02x", $0) }.joined())
                }
            }
        } catch {
            // Live Activities are a nicety (the user may have turned them off); the game doesn't need one.
        }
    }

    private nonisolated static func end() async {
        for running in Activity<GameActivityAttributes>.activities {
            await running.end(nil, dismissalPolicy: .immediate)
        }
    }
}
