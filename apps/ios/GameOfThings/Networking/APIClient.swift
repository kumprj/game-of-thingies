import Foundation

struct APIError: LocalizedError {
    let status: Int
    var errorDescription: String? { "Server responded with status \(status)" }
}

/// REST endpoints from server/routes.ts.
struct APIClient {
    var baseURL: URL = AppConfig.apiBaseURL
    var session: URLSession = .shared

    func createGame(name: String, question: String) async throws -> String {
        struct Response: Decodable { let gameId: String }
        let response: Response = try await send("POST", "api/createGame",
                                                body: ["name": name, "question": question])
        return response.gameId
    }

    func game(_ gameId: String) async throws -> Game {
        try await send("GET", "api/games/\(gameId)")
    }

    func entries(_ gameId: String) async throws -> [Entry] {
        try await send("GET", "api/games/\(gameId)/entries")
    }

    func scores(_ gameId: String) async throws -> [Score] {
        try await send("GET", "api/games/\(gameId)/scores")
    }

    func addEntry(gameId: String, authorName: String, text: String) async throws {
        try await sendIgnoringResponse("POST", "api/games/\(gameId)/entries",
                                       body: ["authorName": authorName, "text": text])
    }

    func startGame(_ gameId: String) async throws {
        try await sendIgnoringResponse("POST", "api/games/\(gameId)/start")
    }

    /// Returns whether the guess was correct.
    func guess(gameId: String, entryId: String, guesserName: String, guess: String) async throws -> Bool {
        struct Response: Decodable { let isCorrect: Bool }
        let response: Response = try await send("POST", "api/games/\(gameId)/entries/\(entryId)/guess",
                                                body: ["guesserName": guesserName, "guess": guess])
        return response.isCorrect
    }

    func resetGame(_ gameId: String, question: String) async throws {
        try await sendIgnoringResponse("POST", "api/games/\(gameId)/reset", body: ["question": question])
    }

    // MARK: - Transport

    private func send<T: Decodable>(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> T {
        let data = try await sendIgnoringResponse(method, path, body: body)
        return try JSONDecoder().decode(T.self, from: data)
    }

    @discardableResult
    private func sendIgnoringResponse(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(status: status) }
        return data
    }
}
