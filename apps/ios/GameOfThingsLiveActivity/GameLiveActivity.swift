import ActivityKit
import SwiftUI
import WidgetKit

@main
struct GameOfThingsLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        GameLiveActivity()
    }
}

/// The lock screen and Dynamic Island views for a round in progress (#71).
struct GameLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GameActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(.blue)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.gameId).font(.caption.bold().monospaced())
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(headline(context.attributes, context.state)).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(upNextText(context.state)).font(.caption)
                }
            } compactLeading: {
                Image(systemName: isMyTurn(context.attributes, context.state) ? "bell.fill" : "person.3.fill")
            } compactTrailing: {
                Text("\(context.state.remaining.count)").monospacedDigit()
            } minimal: {
                Image(systemName: isMyTurn(context.attributes, context.state) ? "bell.fill" : "person.3.fill")
            }
        }
    }
}

private struct LockScreenView: View {
    let attributes: GameActivityAttributes
    let state: GameActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(isMyTurn(attributes, state) ? "Your turn" : "Now guessing")
                .font(.footnote.weight(.semibold))
                .textCase(.uppercase)
                .opacity(0.75)
            Text(headline(attributes, state)).font(.title3.bold())
            Text(upNextText(state)).font(.caption).opacity(0.85)
        }
        .foregroundStyle(.white)
        .padding()
        .accessibilityElement(children: .combine)
    }
}

private func isMyTurn(_ attributes: GameActivityAttributes, _ state: GameActivityAttributes.ContentState) -> Bool {
    state.currentPlayer?.lowercased() == attributes.playerName.lowercased()
}

private func headline(_ attributes: GameActivityAttributes, _ state: GameActivityAttributes.ContentState) -> String {
    guard let current = state.currentPlayer else { return "Round over" }
    return isMyTurn(attributes, state) ? "It's your turn!" : "\(current)'s turn"
}

private func upNextText(_ state: GameActivityAttributes.ContentState) -> String {
    state.upNext.isEmpty ? "\(state.remaining.count) left" : "Up next: " + state.upNext.joined(separator: " → ")
}
