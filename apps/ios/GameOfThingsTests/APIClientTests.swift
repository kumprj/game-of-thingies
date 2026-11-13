import Foundation
import Testing
@testable import GameOfThings

/// Serves canned responses and records requests, so APIClient runs its real URLSession path.
nonisolated final class StubURLProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) static var respond: (URLRequest) -> (Int, String) = { _ in (200, "{}") }
    nonisolated(unsafe) static var requests: [URLRequest] = []

    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        var request = request
        // URLSession moves bodies into a stream before protocols see them
        if let stream = request.httpBodyStream {
            stream.open()
            var body = Data()
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                body.append(buffer, count: read)
            }
            stream.close()
            request.httpBody = body
        }
        let (status, body) = Self.lock.withLock { () -> (Int, String) in
            Self.requests.append(request)
            return Self.respond(request)
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Suites that share StubURLProtocol's static state must not run in parallel with each other.
@Suite(.serialized)
struct StubbedNetworkTests {}

extension StubbedNetworkTests {
@Suite(.serialized)
struct APIClientTests {
    let defaults: UserDefaults
    let api: APIClient

    init() {
        defaults = UserDefaults(suiteName: "APIClientTests")!
        defaults.removePersistentDomain(forName: "APIClientTests")
        api = APIClient(baseURL: URL(string: "http://test.local")!, session: StubURLProtocol.session(),
                        defaults: defaults)
        StubURLProtocol.requests = []
        StubURLProtocol.respond = { _ in (200, "{}") }
    }

    private func jsonBody(_ request: URLRequest) throws -> [String: String] {
        try JSONDecoder().decode([String: String].self, from: try #require(request.httpBody))
    }

    @Test func createGamePostsNameAndQuestion() async throws {
        StubURLProtocol.respond = { _ in (200, #"{"gameId":"WXYZ"}"#) }
        let id = try await api.createGame(name: "Friday", question: "Best snack?")
        #expect(id == "WXYZ")
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://test.local/api/createGame")
        #expect(try jsonBody(request) == ["name": "Friday", "question": "Best snack?"])
    }

    @Test func entriesDefaultMissingFlags() async throws {
        StubURLProtocol.respond = { _ in
            (200, #"[{"entryId":"1","gameId":"G","authorName":"Ann","text":"Tacos","createdAt":"2026-01-01T00:00:00Z","revealed":true}]"#)
        }
        let entries = try await api.entries("ABCD")
        #expect(entries == [Entry(entryId: "1", authorName: "Ann", text: "Tacos",
                                  createdAt: "2026-01-01T00:00:00Z", revealed: true, guessed: false)])
    }

    @Test func entriesDecodeWithoutTextOrAuthorAndWithMine() async throws {
        StubURLProtocol.respond = { _ in
            (200, #"[{"entryId":"1","gameId":"G","createdAt":"t","revealed":false,"guessed":false},{"entryId":"2","gameId":"G","authorName":"Ann","text":"Tacos","createdAt":"t","revealed":false,"guessed":false,"mine":true}]"#)
        }
        let entries = try await api.entries("ABCD")
        #expect(entries[0].authorName == nil && entries[0].text.isEmpty && !entries[0].mine)
        #expect(entries[1].authorName == "Ann" && entries[1].text == "Tacos" && entries[1].mine)
    }

    @Test func entriesRequestSendsPlayerToken() async throws {
        StubURLProtocol.respond = { _ in (200, "[]") }
        _ = try await api.entries("ABCD")
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.value(forHTTPHeaderField: "x-player-token") == api.playerToken())
    }

    @Test func unknownGameThrowsNotFound() async {
        StubURLProtocol.respond = { _ in (404, #"{"error":"Game not found"}"#) }
        do {
            _ = try await api.game("NOPE")
            Issue.record("expected throw")
        } catch let error as APIError {
            #expect(error.status == 404)
            #expect(error.serverMessage == "Game not found")
        } catch { Issue.record("wrong error \(error)") }
    }

    @Test func createGameSurfacesServerValidationMessage() async {
        StubURLProtocol.respond = { _ in (400, #"{"error":"Title is required"}"#) }
        do {
            _ = try await api.createGame(name: "", question: "Q?")
            Issue.record("expected throw")
        } catch let error as APIError {
            #expect(error.status == 400)
            #expect(error.serverMessage == "Title is required")
        } catch { Issue.record("wrong error \(error)") }
    }

    @Test func guessSendsGuesserAndReturnsResult() async throws {
        StubURLProtocol.respond = { _ in (200, #"{"isCorrect":true}"#) }
        let correct = try await api.guess(gameId: "ABCD", entryId: "e1", guesserName: "Bo", guess: "Ann")
        #expect(correct)
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.url?.path == "/api/games/ABCD/entries/e1/guess")
        #expect(try jsonBody(request) == ["guesserName": "Bo", "guess": "Ann"])
    }

    @Test func nonSuccessStatusThrows() async {
        StubURLProtocol.respond = { _ in (500, #"{"error":"Start failed"}"#) }
        await #expect(throws: APIError.self) { try await api.startGame("ABCD") }
    }

    @Test func errorResponseCarriesServerMessage() async {
        StubURLProtocol.respond = { _ in (409, #"{"error":"That name is already taken in this game"}"#) }
        do {
            try await api.addEntry(gameId: "ABCD", authorName: "Ann", text: "x")
            Issue.record("expected throw")
        } catch let error as APIError {
            #expect(error.status == 409)
            #expect(error.serverMessage == "That name is already taken in this game")
            #expect(error.errorDescription == "That name is already taken in this game")
        } catch { Issue.record("wrong error \(error)") }
    }

    @Test func errorWithoutJSONFallsBackToStatus() async {
        StubURLProtocol.respond = { _ in (502, "<html>Bad gateway</html>") }
        do {
            try await api.startGame("ABCD")
            Issue.record("expected throw")
        } catch let error as APIError {
            #expect(error.serverMessage == nil)
            #expect(error.errorDescription == "Server responded with status 502")
        } catch { Issue.record("wrong error \(error)") }
    }

    @Test func createGameStoresHostToken() async throws {
        StubURLProtocol.respond = { _ in (200, #"{"gameId":"WXYZ","hostToken":"tok123"}"#) }
        _ = try await api.createGame(name: "Friday", question: "Q?")
        #expect(defaults.string(forKey: "hostToken.WXYZ") == "tok123")
    }

    @Test func createGameWithoutTokenStoresNothing() async throws {
        StubURLProtocol.respond = { _ in (200, #"{"gameId":"WXYZ"}"#) }
        _ = try await api.createGame(name: "Friday", question: "Q?")
        #expect(defaults.string(forKey: "hostToken.WXYZ") == nil)
    }

    @Test func startAndResetSendHostToken() async throws {
        defaults.set("tok123", forKey: "hostToken.ABCD")
        try await api.startGame("ABCD")
        try await api.resetGame("ABCD", question: "Next?")
        #expect(StubURLProtocol.requests.count == 2)
        for request in StubURLProtocol.requests {
            #expect(request.value(forHTTPHeaderField: "x-host-token") == "tok123")
        }
    }

    @Test func startReturnsTurnOrder() async throws {
        StubURLProtocol.respond = { _ in (200, #"{"success":true,"turnOrder":["Bo","Ann"]}"#) }
        #expect(try await api.startGame("ABCD") == ["Bo", "Ann"])
    }

    @Test func startOmitsHeaderWithoutToken() async throws {
        try await api.startGame("ABCD")
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.value(forHTTPHeaderField: "x-host-token") == nil)
    }

    @Test func transferHostSendsTargetAndToken() async throws {
        defaults.set("tok123", forKey: "hostToken.ABCD")
        try await api.transferHost(gameId: "ABCD", targetPlayerName: "Bo")
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.path == "/api/games/ABCD/transfer-host")
        #expect(request.value(forHTTPHeaderField: "x-host-token") == "tok123")
        let body = try JSONDecoder().decode([String: String].self, from: #require(request.httpBody))
        #expect(body == ["targetPlayerName": "Bo"])
    }

    @Test func forbiddenAndConflictMapToStatus() async {
        StubURLProtocol.respond = { _ in (403, #"{"error":"Forbidden"}"#) }
        await #expect(throws: APIError.self) { try await api.startGame("ABCD") }
        do { try await api.startGame("ABCD") } catch let error as APIError { #expect(error.status == 403) } catch {}
        StubURLProtocol.respond = { _ in (409, #"{"error":"Already started"}"#) }
        do { try await api.startGame("ABCD") } catch let error as APIError { #expect(error.status == 409) } catch {}
    }

    @Test func registerDeviceSendsTokensAndSandboxFlagWithThePlayerToken() async throws {
        try await api.registerDevice(gameId: "ABCD", playerName: "Ann Lee", pushToken: "ab12", activityToken: nil, sandbox: true)
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.httpMethod == "PUT")
        #expect(request.url?.path == "/api/games/ABCD/players/Ann%20Lee/device")
        #expect(request.value(forHTTPHeaderField: "x-player-token") == api.playerToken())
        let data = try #require(request.httpBody)
        let body = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(body["pushToken"] as? String == "ab12")
        #expect(body["sandbox"] as? Bool == true)
        #expect(body["activityToken"] == nil)
    }

    @Test func removeDeviceDeletesWithThePlayerToken() async throws {
        try await api.removeDevice(gameId: "ABCD", playerName: "Ann")
        let request = try #require(StubURLProtocol.requests.first)
        #expect(request.httpMethod == "DELETE")
        #expect(request.url?.path == "/api/games/ABCD/players/Ann/device")
        #expect(request.value(forHTTPHeaderField: "x-player-token") == api.playerToken())
    }
}
}
