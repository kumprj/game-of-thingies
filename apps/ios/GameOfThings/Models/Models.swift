import Foundation

// Mirrors types/index.ts. DynamoDB omits attributes that were never set
// (e.g. `guessed` before a correct guess, everything on an unknown game),
// so anything the server doesn't always write decodes with a default.

struct Entry: Decodable, Identifiable, Hashable {
    let entryId: String
    let authorName: String
    let text: String
    let createdAt: String
    let revealed: Bool
    let guessed: Bool

    var id: String { entryId }

    init(entryId: String, authorName: String, text: String, createdAt: String = "",
         revealed: Bool = false, guessed: Bool = false) {
        self.entryId = entryId
        self.authorName = authorName
        self.text = text
        self.createdAt = createdAt
        self.revealed = revealed
        self.guessed = guessed
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entryId = try c.decode(String.self, forKey: .entryId)
        authorName = try c.decode(String.self, forKey: .authorName)
        text = try c.decode(String.self, forKey: .text)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        revealed = try c.decodeIfPresent(Bool.self, forKey: .revealed) ?? false
        guessed = try c.decodeIfPresent(Bool.self, forKey: .guessed) ?? false
    }

    private enum CodingKeys: String, CodingKey {
        case entryId, authorName, text, createdAt, revealed, guessed
    }
}

/// GET /api/games/:id returns `{}` for an unknown code, so every field is optional.
struct Game: Decodable {
    var gameOwner: String?
    var question: String?
    var started: Bool?
    var turnOrder: [String]?
}

struct Score: Decodable, Hashable {
    let playerName: String
    let score: Int
}

// MARK: - Socket event payloads (server/routes.ts)

struct GameStartedEvent: Decodable {
    var turnOrder: [String]?
}

/// Payload of both `wrongAnswer` and `scoreUpdated`; `guess` is the entry's text.
struct GuessEvent: Decodable {
    var playerName: String?
    var authorName: String?
    var guess: String?
}

struct NextTurnEvent: Decodable {
    var currentPlayer: String?
    var turnOrder: [String]
}
