import SwiftUI

/// Full-width, large prominent button laid out as its own borderless Form row.
struct FormButton: View {
    let title: LocalizedStringKey
    var busyTitle: LocalizedStringKey? = nil
    var isBusy = false
    var tint: Color = .accentColor
    var prominent = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isBusy, let busyTitle {
                    ProgressView()
                    Text(busyTitle)
                } else {
                    Text(title)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .modifier(ProminenceStyle(prominent: prominent))
        .controlSize(.large)
        .tint(tint)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
}

private struct ProminenceStyle: ViewModifier {
    let prominent: Bool

    func body(content: Content) -> some View {
        if prominent {
            content.buttonStyle(.borderedProminent)
        } else {
            content.buttonStyle(.bordered)
        }
    }
}
