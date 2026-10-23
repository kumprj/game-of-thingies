import Foundation
import Testing
@testable import GameOfThings

struct SocketIOPacketTests {
    @Test func decodesEventWithObjectPayload() throws {
        let event = try #require(SocketIOPacket.decodeEvent(#"42["nextTurn",{"currentPlayer":"Ann","turnOrder":["Ann","Bo"]}]"#))
        #expect(event.name == "nextTurn")
        let payload = try JSONDecoder().decode(NextTurnEvent.self, from: try #require(event.payload))
        #expect(payload.currentPlayer == "Ann")
        #expect(payload.turnOrder == ["Ann", "Bo"])
    }

    @Test func decodesEventWithoutPayload() throws {
        let event = try #require(SocketIOPacket.decodeEvent(#"42["entriesUpdated"]"#))
        #expect(event.name == "entriesUpdated")
        #expect(event.payload == nil)
    }

    @Test func skipsAckId() throws {
        let event = try #require(SocketIOPacket.decodeEvent(#"4217["gameReset"]"#))
        #expect(event.name == "gameReset")
    }

    @Test func nullCurrentPlayerDecodes() throws {
        let event = try #require(SocketIOPacket.decodeEvent(#"42["nextTurn",{"currentPlayer":null,"turnOrder":[]}]"#))
        let payload = try JSONDecoder().decode(NextTurnEvent.self, from: try #require(event.payload))
        #expect(payload.currentPlayer == nil)
    }

    @Test func rejectsNonEventPackets() {
        #expect(SocketIOPacket.decodeEvent("40") == nil)
        #expect(SocketIOPacket.decodeEvent("2") == nil)
        #expect(SocketIOPacket.decodeEvent("42not json") == nil)
    }

    @Test func encodesEvent() {
        #expect(SocketIOPacket.encodeEvent("joinGame", "ABCD") == #"42["joinGame","ABCD"]"#)
    }
}
