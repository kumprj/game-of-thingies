import Foundation

/// `gameofthings://ABCD` links, registered in Config/Info.plist.
enum GameLink {
    static let scheme = "gameofthings"

    /// The game code a link points at, if it's a well-formed 4-letter code (any case).
    static func gameId(from url: URL) -> String? {
        guard url.scheme?.lowercased() == scheme, let code = url.host()?.uppercased(),
              code.count == 4, code.allSatisfy({ ("A"..."Z").contains($0) }) else { return nil }
        return code
    }
}
