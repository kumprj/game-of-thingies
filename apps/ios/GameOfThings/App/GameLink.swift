import Foundation

/// `gameofthings://ABCD` custom scheme links and universal `https://<domain>/ABCD` links.
enum GameLink {
    static let scheme = "gameofthings"

    /// The game code a link points at, if it's a well-formed 4-letter code (any case).
    static func gameId(from url: URL) -> String? {
        let scheme = url.scheme?.lowercased()
        let rawCode: String?
        if scheme == Self.scheme {
            rawCode = url.host()
        } else if scheme == "https" {
            let path = url.path().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            rawCode = path
        } else {
            return nil
        }

        guard let code = rawCode?.uppercased(),
              code.count == 4,
              code.allSatisfy({ ("A"..."Z").contains($0) }) else { return nil }
        return code
    }
}
