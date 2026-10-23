import SwiftUI

/// Flips between light and dark, starting from whatever is showing (like the web TopBar toggle).
struct ThemeToggleButton: View {
    @AppStorage("theme") private var theme = ""
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        Button {
            theme = isDark ? "light" : "dark"
        } label: {
            Image(systemName: isDark ? "moon.fill" : "sun.max.fill")
                .contentTransition(.symbolEffect(.replace))
        }
        .accessibilityLabel(isDark ? "Switch to Light Mode" : "Switch to Dark Mode")
    }
}
