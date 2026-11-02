import Foundation

// Mirrors types/index.ts. DynamoDB omits attributes that were never set
// (e.g. `guessed` before a correct guess, everything on an unknown game),
// so anything the server doesn't always write decodes with a default.

struct Entry: Decodable, Identifiable, Hashable {
    let entryId: String
    /// Hidden by the server until the entry is guessed (or it is yours).
    let authorName: String?
    /// Hidden by the server for other players' entries before the game starts.
    let text: String
    let createdAt: String
    let revealed: Bool
    let guessed: Bool
    /// Written by this device (the server matches the x-player-token header).
    let mine: Bool

    var id: String { entryId }

    init(entryId: String, authorName: String? = nil, text: String = "", createdAt: String = "",
         revealed: Bool = false, guessed: Bool = false, mine: Bool = false) {
        self.entryId = entryId
        self.authorName = authorName
        self.text = text
        self.createdAt = createdAt
        self.revealed = revealed
        self.guessed = guessed
        self.mine = mine
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entryId = try c.decode(String.self, forKey: .entryId)
        authorName = try c.decodeIfPresent(String.self, forKey: .authorName)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        revealed = try c.decodeIfPresent(Bool.self, forKey: .revealed) ?? false
        guessed = try c.decodeIfPresent(Bool.self, forKey: .guessed) ?? false
        mine = try c.decodeIfPresent(Bool.self, forKey: .mine) ?? false
    }

    private enum CodingKeys: String, CodingKey {
        case entryId, authorName, text, createdAt, revealed, guessed, mine
    }
}

/// GET /api/games/:id returns `{}` for an unknown code, so every field is optional.
struct Game: Decodable {
    var title: String?
    var question: String?
    var started: Bool?
    var turnOrder: [String]?
    var hostName: String?
    /// Everyone who answered this round; sent once the game has started.
    var players: [String]?
}

struct Score: Decodable, Hashable {
    let playerName: String
    let score: Int
}

// MARK: - Socket event payloads (server/routes.ts)

struct GameStartedEvent: Decodable {
    var turnOrder: [String]?
}

struct HostTransferredEvent: Decodable {
    var newHostName: String
    var hostToken: String
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
