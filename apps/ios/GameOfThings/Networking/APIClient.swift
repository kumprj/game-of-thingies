import Foundation

struct APIError: LocalizedError {
    let status: Int
    /// The server's `{ "error": "..." }` text, when it sent one.
    var serverMessage: String? = nil
    var errorDescription: String? { serverMessage ?? "Server responded with status \(status)" }

    /// Extracts the `error` string from a JSON error body; nil if absent or blank.
    static func message(from data: Data) -> String? {
        struct Body: Decodable { let error: String? }
        guard let text = (try? JSONDecoder().decode(Body.self, from: data))?.error?
            .trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }
}

/// REST endpoints from server/routes.ts.
struct APIClient {
    var baseURL: URL = AppConfig.apiBaseURL
    var session: URLSession = .shared
    var defaults: UserDefaults = .standard

    /// The host token createGame returns; the server requires it (x-host-token) to start or reset.
    static func hostTokenKey(_ gameId: String) -> String { "hostToken.\(gameId)" }
    private func hostTokenKey(_ gameId: String) -> String { Self.hostTokenKey(gameId) }

    /// Per-device player token (x-player-token) tying a name to the device.
    static let playerTokenKey = "got_playerToken"
    func playerToken() -> String {
        if let token = defaults.string(forKey: Self.playerTokenKey) {
            return token
        }
        let newToken = UUID().uuidString
        defaults.set(newToken, forKey: Self.playerTokenKey)
        return newToken
    }
    private func playerHeaders() -> [String: String] {
        ["x-player-token": playerToken()]
    }

    func createGame(name: String, question: String) async throws -> String {
        struct Response: Decodable { let gameId: String; let hostToken: String? }
        let response: Response = try await send("POST", "api/createGame",
                                                body: ["name": name, "question": question])
        if let token = response.hostToken { defaults.set(token, forKey: hostTokenKey(response.gameId)) }
        return response.gameId
    }

    func game(_ gameId: String) async throws -> Game {
        try await send("GET", "api/games/\(gameId)")
    }

    func entries(_ gameId: String) async throws -> [Entry] {
        try await send("GET", "api/games/\(gameId)/entries", headers: playerHeaders())
    }

    func scores(_ gameId: String) async throws -> [Score] {
        try await send("GET", "api/games/\(gameId)/scores")
    }

    func addEntry(gameId: String, authorName: String, text: String) async throws {
        try await sendIgnoringResponse("POST", "api/games/\(gameId)/entries",
                                       body: ["authorName": authorName, "text": text],
                                       headers: playerHeaders())
    }

    func editEntry(gameId: String, entryId: String, text: String) async throws {
        try await sendIgnoringResponse("PATCH", "api/games/\(gameId)/entries/\(entryId)",
                                       body: ["text": text],
                                       headers: playerHeaders())
    }

    func deleteEntry(gameId: String, entryId: String) async throws {
        try await sendIgnoringResponse("DELETE", "api/games/\(gameId)/entries/\(entryId)",
                                       headers: playerHeaders())
    }

    /// Returns the turn order so the host doesn't depend on its own socket event to see whose turn it is.
    /// `turnSeconds` turns the per-turn timer on (#72); nil leaves it off.
    func startGame(_ gameId: String, turnSeconds: Int? = nil) async throws -> [String] {
        struct Response: Decodable { let turnOrder: [String]? }
        let response: Response = try await send("POST", "api/games/\(gameId)/start",
                                                body: turnSeconds.map { ["turnSeconds": $0] },
                                                headers: hostHeaders(gameId))
        return response.turnOrder ?? []
    }

    func skipTurn(_ gameId: String) async throws -> [String] {
        struct Response: Decodable { let turnOrder: [String]? }
        let response: Response = try await send("POST", "api/games/\(gameId)/skip-turn", headers: hostHeaders(gameId))
        return response.turnOrder ?? []
    }

    func removePlayer(gameId: String, playerName: String) async throws -> [String] {
        struct Response: Decodable { let turnOrder: [String]? }
        let response: Response = try await send("DELETE", "api/games/\(gameId)/players/\(encoded(playerName))",
                                                headers: hostHeaders(gameId))
        return response.turnOrder ?? []
    }

    func transferHost(gameId: String, targetPlayerName: String) async throws {
        try await sendIgnoringResponse("POST", "api/games/\(gameId)/transfer-host",
                                       body: ["targetPlayerName": targetPlayerName],
                                       headers: hostHeaders(gameId))
    }

    /// Tells the server where to push this player's turn notifications and Live Activity updates (#71).
    /// Either token may be nil; the server keeps the other as it was.
    func registerDevice(gameId: String, playerName: String, pushToken: String?, activityToken: String?,
                        sandbox: Bool) async throws {
        struct Body: Encodable { let pushToken: String?; let activityToken: String?; let sandbox: Bool }
        try await sendIgnoringResponse("PUT", "api/games/\(gameId)/players/\(encoded(playerName))/device",
                                       body: Body(pushToken: pushToken, activityToken: activityToken, sandbox: sandbox),
                                       headers: playerHeaders())
    }

    /// Opt out: the server forgets this player's tokens.
    func removeDevice(gameId: String, playerName: String) async throws {
        try await sendIgnoringResponse("DELETE", "api/games/\(gameId)/players/\(encoded(playerName))/device",
                                       headers: playerHeaders())
    }

    private func encoded(_ name: String) -> String {
        name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
    }

    func saveHostToken(gameId: String, token: String) {
        defaults.set(token, forKey: hostTokenKey(gameId))
    }

    func removeHostToken(_ gameId: String) {
        defaults.removeObject(forKey: hostTokenKey(gameId))
    }

    /// Returns whether the guess was correct.
    func guess(gameId: String, entryId: String, guesserName: String, guess: String) async throws -> Bool {
        struct Response: Decodable { let isCorrect: Bool }
        let response: Response = try await send("POST", "api/games/\(gameId)/entries/\(entryId)/guess",
                                                body: ["guesserName": guesserName, "guess": guess],
                                                headers: playerHeaders())
        return response.isCorrect
    }

    func resetGame(_ gameId: String, question: String) async throws {
        try await sendIgnoringResponse("POST", "api/games/\(gameId)/reset", body: ["question": question],
                                       headers: hostHeaders(gameId))
    }

    private func hostHeaders(_ gameId: String) -> [String: String] {
        defaults.string(forKey: hostTokenKey(gameId)).map { ["x-host-token": $0] } ?? [:]
    }

    // MARK: - Transport

    private func send<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil,
                                    headers: [String: String] = [:]) async throws -> T {
        let data = try await sendIgnoringResponse(method, path, body: body, headers: headers)
        return try JSONDecoder().decode(T.self, from: data)
    }

    @discardableResult
    private func sendIgnoringResponse(_ method: String, _ path: String, body: (any Encodable)? = nil,
                                          headers: [String: String] = [:]) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(status: status, serverMessage: APIError.message(from: data)) }
        return data
    }
}
