import Foundation

/// Just enough of a Socket.IO v4 client for this game: Engine.IO protocol 4 over a
/// WebSocket, default namespace, emitting and receiving events (no acks, no binary).
/// Reconnects with backoff like socket.io-client does.
final class RealtimeClient {
    /// Server event name and its first argument as JSON.
    var onEvent: ((_ name: String, _ payload: Data?) -> Void)?
    /// Fired on transitions only: `true` once the namespace is joined, `false` when a
    /// live connection drops or an attempt fails. Not fired for `disconnect()`.
    var onConnectionChange: ((_ connected: Bool) -> Void)?

    private let url: URL
    private let session: URLSession
    private var task: URLSessionWebSocketTask?
    private var receiveLoop: Task<Void, Never>?
    private var watchdog: Task<Void, Never>?
    private var reconnect: Task<Void, Never>?
    private var wantsConnection = false
    private var failedAttempts = 0
    private var reportedConnected: Bool?
    /// From the server's open packet: a ping is due every pingInterval + pingTimeout.
    private var heartbeatDeadline: Duration = .seconds(45)

    init(baseURL: URL = AppConfig.apiBaseURL, session: URLSession = .shared) {
        var components = URLComponents(url: baseURL.appending(path: "socket.io/"), resolvingAgainstBaseURL: false)!
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components.queryItems = [URLQueryItem(name: "EIO", value: "4"),
                                 URLQueryItem(name: "transport", value: "websocket")]
        url = components.url!
        self.session = session
    }

    var isConnected: Bool { reportedConnected == true }

    /// Connects now, skipping any pending backoff. No-op while a socket is open.
    func connect() {
        wantsConnection = true
        reconnect?.cancel()
        if task == nil { open() }
    }

    func disconnect() {
        wantsConnection = false
        reconnect?.cancel()
        if isConnected { send("41") }
        teardown()
        reportedConnected = nil
    }

    func emit(_ event: String, _ argument: String) {
        guard isConnected, let packet = SocketIOPacket.encodeEvent(event, argument) else { return }
        send(packet)
    }

    // MARK: - Connection lifecycle

    private func open() {
        let task = session.webSocketTask(with: url)
        self.task = task
        task.resume()
        armWatchdog(for: task, timeout: .seconds(20))
        receiveLoop = Task { [weak self] in
            do {
                while true {
                    if case .string(let text) = try await task.receive() {
                        self?.handle(text, from: task)
                    }
                }
            } catch {
                self?.connectionLost(task)
            }
        }
    }

    private func handle(_ text: String, from task: URLSessionWebSocketTask) {
        guard task === self.task, let type = text.first else { return }
        switch type {
        case "0": // Engine.IO open: learn the heartbeat, then join the default namespace
            if let data = text.dropFirst().data(using: .utf8),
               let open = try? JSONDecoder().decode(OpenPacket.self, from: data) {
                heartbeatDeadline = .milliseconds(open.pingInterval + open.pingTimeout)
            }
            armWatchdog(for: task, timeout: heartbeatDeadline)
            send("40")
        case "2": // ping
            send("3")
            armWatchdog(for: task, timeout: heartbeatDeadline)
        case "1": // close
            connectionLost(task)
        case "4": // message carrying a Socket.IO packet
            switch text.dropFirst().first {
            case "0": // namespace connected
                failedAttempts = 0
                report(connected: true)
            case "2":
                if let event = SocketIOPacket.decodeEvent(text) { onEvent?(event.name, event.payload) }
            case "1", "4": // namespace disconnect / connect error
                connectionLost(task)
            default:
                break
            }
        default:
            break
        }
    }

    /// Treats the socket as dead if nothing proves it alive before `timeout`.
    private func armWatchdog(for task: URLSessionWebSocketTask, timeout: Duration) {
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            try? await Task.sleep(for: timeout)
            guard !Task.isCancelled else { return }
            self?.connectionLost(task)
        }
    }

    private func connectionLost(_ lost: URLSessionWebSocketTask) {
        guard lost === task else { return } // stale callback from a replaced socket
        teardown()
        report(connected: false)
        guard wantsConnection else { return }
        failedAttempts += 1
        let delay = min(5.0, pow(2.0, Double(failedAttempts - 1))) // 1s, 2s, 4s, 5s...
        reconnect = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, let self, self.wantsConnection, self.task == nil else { return }
            self.open()
        }
    }

    private func teardown() {
        watchdog?.cancel()
        receiveLoop?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func report(connected: Bool) {
        guard reportedConnected != connected else { return }
        reportedConnected = connected
        onConnectionChange?(connected)
    }

    private func send(_ text: String) {
        task?.send(.string(text)) { _ in } // failures surface through receive()
    }

    private struct OpenPacket: Decodable {
        let pingInterval: Int
        let pingTimeout: Int
    }
}

/// Socket.IO EVENT packets inside an Engine.IO MESSAGE: `42["name",arg]`,
/// optionally with an ack id between the type and the array (`4217["name"]`).
enum SocketIOPacket {
    static func decodeEvent(_ text: String) -> (name: String, payload: Data?)? {
        guard text.hasPrefix("42") else { return nil }
        let json = text.dropFirst(2).drop(while: \.isNumber)
        guard let data = json.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
              let name = array.first as? String else { return nil }
        let payload = array.count > 1
            ? try? JSONSerialization.data(withJSONObject: array[1], options: .fragmentsAllowed)
            : nil
        return (name, payload)
    }

    static func encodeEvent(_ name: String, _ argument: String) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: [name, argument]) else { return nil }
        return "42" + String(decoding: data, as: UTF8.self)
    }
}
