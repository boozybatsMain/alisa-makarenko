// Foreground (person) mask with Apple Vision, headless, macOS 14+.
// Build: swiftc -O scripts/portrait/mask.swift -o /tmp/mask   Run: /tmp/mask photo.jpg mask.png
import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let inURL = URL(fileURLWithPath: args[1])
let maskOut = URL(fileURLWithPath: args[2])
guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let cg = CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { fatalError("read") }
let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
let orient = (props?[kCGImagePropertyOrientation] as? UInt32).flatMap { CGImagePropertyOrientation(rawValue: $0) } ?? .up
print("orientation", orient.rawValue, cg.width, cg.height)
let req = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(cgImage: cg, orientation: orient, options: [:])
try h.perform([req])
guard let obs = req.results?.first else { fatalError("no result") }
print("instances", obs.allInstances.count)
let pb = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: h)
var ci = CIImage(cvPixelBuffer: pb)
print("mask", ci.extent)
let ctx = CIContext()
try ctx.writePNGRepresentation(of: ci, to: maskOut, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
print("ok")
