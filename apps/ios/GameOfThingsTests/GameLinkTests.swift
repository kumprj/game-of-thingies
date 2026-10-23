import Foundation
import Testing
@testable import GameOfThings

struct GameLinkTests {
    @Test(arguments: [
        ("gameofthings://ABCD", "ABCD"),
        ("gameofthings://abcd", "ABCD"),
        ("GameOfThings://WxYz/", "WXYZ"),
    ])
    func acceptsGameCodes(link: String, expected: String) {
        #expect(GameLink.gameId(from: URL(string: link)!) == expected)
    }

    @Test(arguments: [
        "gameofthings://ABC",
        "gameofthings://ABCDE",
        "gameofthings://AB1D",
        "gameofthings://",
        "https://ABCD",
    ])
    func rejectsEverythingElse(link: String) {
        #expect(GameLink.gameId(from: URL(string: link)!) == nil)
    }
}
