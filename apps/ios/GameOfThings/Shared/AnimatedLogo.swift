import SwiftUI

/// The galloping-horse logo (the native twin of client/src/assets/logo.svg). It plays through
/// once when it appears, then settles on the still pose; with Reduce Motion it starts still.
struct AnimatedLogo: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?
    @State private var settled = false

    var body: some View {
        TimelineView(.animation(paused: settled || reduceMotion)) { context in
            let time = settled || reduceMotion ? LogoMotion.duration : start.map { context.date.timeIntervalSince($0) } ?? 0
            Canvas { graphics, size in
                graphics.scaleBy(x: size.width / 400, y: size.height / 400)
                LogoMotion.draw(in: graphics, at: time)
            }
        }
        .task {
            guard !reduceMotion else { return }
            start = .now
            try? await Task.sleep(for: .seconds(LogoMotion.duration))
            settled = true
        }
    }
}

/// Draws the logo at a moment of its single play-through. Timings and keyframes match the
/// CSS in logo.svg; every motion begins and ends at the resting pose.
private enum LogoMotion {
    static let stride = 1.0
    static let strides = 2.0
    static let wave = 1.6
    static let waveStagger = 0.1
    static let twinkle = 1.0
    static let twinkleStagger = 0.4
    static let orbit = 3.0
    static let duration = 3.0

    static let ink = Color(red: 0x3f / 255, green: 0x46 / 255, blue: 0x4d / 255)
    static let orange = Color(red: 1, green: 0x8a / 255, blue: 0x3d / 255)
    static let yellow = Color(red: 1, green: 0xc5 / 255, blue: 0x3d / 255)
    static let pink = Color(red: 1, green: 0x5e / 255, blue: 0x7e / 255)
    static let dust = Color(red: 0xc9 / 255, green: 0xce / 255, blue: 0xd3 / 255)

    static let center = CGPoint(x: 200, y: 200)
    static let ringRadius = 178.0

    // MARK: Drawing

    static func draw(in graphics: GraphicsContext, at time: Double) {
        graphics.fill(Path(CGRect(x: 0, y: 0, width: 400, height: 400)), with: .color(.white))

        let ring = Path(ellipseIn: CGRect(x: 22, y: 22, width: 356, height: 356))
        graphics.stroke(ring, with: .color(ink), lineWidth: 9)
        drawOrbitingArcs(in: graphics, at: time)
        drawSpeedLines(in: graphics, at: time)
        drawDust(in: graphics, at: time)
        drawSparkles(in: graphics, at: time)
        drawHorse(in: graphics, at: time)
        drawLetters(in: graphics, at: time)
    }

    private static func drawOrbitingArcs(in graphics: GraphicsContext, at time: Double) {
        let spin = phase(time, period: orbit, count: 1).map { 360 * easeInOut($0) } ?? 0
        for (color, length, rest) in [(orange, 90.0, 0.0), (yellow, 50.0, 120.0), (pink, 30.0, 240.0)] {
            let startAngle = rest + spin
            var arc = Path()
            arc.addArc(center: center, radius: ringRadius, startAngle: .degrees(startAngle),
                       endAngle: .degrees(startAngle + length / ringRadius * 180 / .pi), clockwise: false)
            graphics.stroke(arc, with: .color(color), style: StrokeStyle(lineWidth: 9, lineCap: .round))
        }
    }

    private static func drawSpeedLines(in graphics: GraphicsContext, at time: Double) {
        let lines: [(Color, CGFloat, CGFloat, CGFloat, Double)] = [
            (orange, 70, 138, 204, 0), (yellow, 56, 128, 220, -stride / 3), (pink, 72, 134, 236, -2 * stride / 3),
        ]
        for (color, x1, x2, y, delay) in lines {
            let offset = phase(time, period: stride, delay: delay, count: strides) ?? 0
            var line = Path()
            line.move(to: CGPoint(x: x1, y: y))
            line.addLine(to: CGPoint(x: x2, y: y))
            let style = StrokeStyle(lineWidth: 6, lineCap: .round, dash: [26, 60], dashPhase: 86 * offset)
            graphics.stroke(line, with: .color(color), style: style)
        }
    }

    private static func drawDust(in graphics: GraphicsContext, at time: Double) {
        for (x, y, radius, delay) in [(134.0, 258.0, 8.0, 0.0), (236.0, 246.0, 6.0, stride / 2)] {
            guard let p = phase(time, period: stride, delay: delay, count: strides) else { continue }
            let eased = 1 - (1 - p) * (1 - p)
            let r = radius * (0.4 + eased)
            let puff = Path(ellipseIn: CGRect(x: x - 26 * eased - r, y: y - r, width: 2 * r, height: 2 * r))
            graphics.fill(puff, with: .color(dust.opacity(0.9 * (1 - eased))))
        }
    }

    private static func drawSparkles(in graphics: GraphicsContext, at time: Double) {
        let sparkles: [(Color, CGPoint, CGFloat, CGFloat)] = [
            (yellow, CGPoint(x: 190, y: 58), 18, 5), (pink, CGPoint(x: 96, y: 120.5), 12.5, 3.5), (orange, CGPoint(x: 338, y: 187), 11, 3),
        ]
        for (index, (color, point, radius, waist)) in sparkles.enumerated() {
            let p = phase(time, period: twinkle, delay: Double(index) * twinkleStagger, count: strides) ?? 0
            let dip = keyframes(p, [(0, 0), (0.5, 1), (1, 0)])
            var context = graphics
            context.opacity = 1 - 0.8 * dip
            context.translateBy(x: point.x, y: point.y)
            context.rotate(by: .degrees(90 * dip))
            context.scaleBy(x: 1 - 0.6 * dip, y: 1 - 0.6 * dip)
            context.fill(sparkle(radius: radius, waist: waist), with: .color(color))
        }
    }

    private static func drawHorse(in graphics: GraphicsContext, at time: Double) {
        let gallop = phase(time, period: stride, count: strides) ?? 0
        var horse = graphics
        horse.translateBy(x: LogoArt.horsePivot.x, y: LogoArt.horsePivot.y)
        horse.translateBy(x: 0, y: keyframes(gallop, [(0, 0), (0.25, -10), (0.5, -3), (0.75, -8), (1, 0)]))
        horse.rotate(by: .degrees(keyframes(gallop, [(0, 0), (0.25, -4), (0.5, 0), (0.75, 3), (1, 0)])))
        horse.translateBy(x: -LogoArt.horsePivot.x, y: -LogoArt.horsePivot.y)

        let swing: [(Double, Double)] = [(0, 0), (0.25, -14), (0.75, 16), (1, 0)]
        fill(LogoArt.farHindLeg, in: horse, pivot: LogoArt.farHindLegPivot, rotation: keyframes(1 - gallop, swing))
        fill(LogoArt.farFrontLeg, in: horse, pivot: LogoArt.farFrontLegPivot, rotation: keyframes(gallop, swing))

        let flutter = phase(time, period: stride / 2, count: 2 * strides) ?? 0
        let rotation: [(Double, Double)] = [(0, 0), (0.25, -4), (0.75, 5), (1, 0)]
        let skew: [(Double, Double)] = [(0, 0), (0.25, -6), (0.75, 4), (1, 0)]
        fill(LogoArt.mane, in: horse, pivot: LogoArt.manePivot,
             rotation: keyframes(flutter, rotation), skew: keyframes(flutter, skew))
        fill(LogoArt.forelock, in: horse, pivot: LogoArt.forelockPivot,
             rotation: keyframes(1 - flutter, rotation), skew: keyframes(1 - flutter, skew))
        horse.fill(LogoArt.body, with: .color(ink))
    }

    private static func drawLetters(in graphics: GraphicsContext, at time: Double) {
        for glyph in LogoArt.glyphs {
            let p = phase(time, period: wave, delay: Double(glyph.index) * waveStagger, count: 1) ?? 0
            let lift = keyframes(p, [(0, 0), (0.25, 1), (0.6, 0), (1, 0)])
            var context = graphics
            context.translateBy(x: glyph.position.x, y: glyph.position.y)
            context.rotate(by: .degrees(glyph.rotation))
            context.translateBy(x: 0, y: -7 * lift)
            context.scaleBy(x: 1 + 0.12 * lift, y: 1 + 0.12 * lift)
            let letter = Text(glyph.character).font(.custom("AvenirNext-Heavy", size: 30))
            context.draw(letter.foregroundStyle(ink), at: .zero)
            if lift > 0 {
                context.opacity = lift
                context.draw(letter.foregroundStyle(orange), at: .zero)
            }
        }
    }

    // MARK: Helpers

    private static func fill(_ part: Path, in graphics: GraphicsContext, pivot: CGPoint, rotation: Double, skew: Double = 0) {
        var context = graphics
        context.translateBy(x: pivot.x, y: pivot.y)
        context.rotate(by: .degrees(rotation))
        context.concatenate(CGAffineTransform(a: 1, b: 0, c: tan(skew * .pi / 180), d: 1, tx: 0, ty: 0))
        context.translateBy(x: -pivot.x, y: -pivot.y)
        context.fill(part, with: .color(ink))
    }

    private static func sparkle(radius: CGFloat, waist: CGFloat) -> Path {
        Path { p in
            p.move(to: CGPoint(x: 0, y: -radius))
            p.addLine(to: CGPoint(x: waist, y: -waist))
            p.addLine(to: CGPoint(x: radius, y: 0))
            p.addLine(to: CGPoint(x: waist, y: waist))
            p.addLine(to: CGPoint(x: 0, y: radius))
            p.addLine(to: CGPoint(x: -waist, y: waist))
            p.addLine(to: CGPoint(x: -radius, y: 0))
            p.addLine(to: CGPoint(x: -waist, y: -waist))
            p.closeSubpath()
        }
    }

    /// Where `time` falls within the current cycle (0..<1), or nil before the delay or after the
    /// last cycle. A negative delay starts partway through, like CSS animation-delay.
    private static func phase(_ time: Double, period: Double, delay: Double = 0, count: Double) -> Double? {
        let local = time - delay
        guard local >= 0, local < period * count else { return nil }
        return local.truncatingRemainder(dividingBy: period) / period
    }

    /// Interpolates (offset, value) stops, easing in and out between each pair like CSS ease-in-out.
    private static func keyframes(_ p: Double, _ stops: [(Double, Double)]) -> Double {
        guard let next = stops.firstIndex(where: { $0.0 >= p }), next > 0 else { return stops[0].1 }
        let (from, to) = (stops[next - 1], stops[next])
        return from.1 + (to.1 - from.1) * easeInOut((p - from.0) / (to.0 - from.0))
    }

    private static func easeInOut(_ x: Double) -> Double {
        x * x * (3 - 2 * x)
    }
}

#Preview {
    AnimatedLogo()
        .frame(width: 240, height: 240)
}
