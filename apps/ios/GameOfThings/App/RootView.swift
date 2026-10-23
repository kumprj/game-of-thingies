import SwiftUI

struct RootView: View {
    /// Same values and key as the web client's `theme` localStorage entry;
    /// empty means follow the system appearance.
    @AppStorage("theme") private var theme = ""
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(openGame: { path.append($0) })
                .navigationDestination(for: String.self) { gameId in
                    GameView(gameId: gameId)
                }
        }
        .onOpenURL { url in
            // Replace whatever game is open rather than stacking games on top of each other
            if let gameId = GameLink.gameId(from: url) { path = [gameId] }
        }
        .preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
    }
}
