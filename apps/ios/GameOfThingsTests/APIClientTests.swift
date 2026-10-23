import Foundation
import Testing
@testable import GameOfThings

/// Serves canned responses and records requests, so APIClient runs its real URLSession path.
nonisolated final class StubURLProtocol: URLProtocol {
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
        Self.requests.append(request)
        let (status, body) = Self.respond(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

@Suite(.serialized)
struct APIClientTests {
    let api = APIClient(baseURL: URL(string: "http://test.local")!, session: StubURLProtocol.session())

    init() { StubURLProtocol.requests = [] }

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

    @Test func unknownGameDecodesAsEmpty() async throws {
        StubURLProtocol.respond = { _ in (200, "{}") }
        let game = try await api.game("NOPE")
        #expect(game.question == nil && game.turnOrder == nil)
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
}
