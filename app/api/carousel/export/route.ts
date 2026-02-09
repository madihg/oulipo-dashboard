import { NextRequest, NextResponse } from 'next/server'

interface SlideExportData {
  imageData: string  // base64 PNG data
  filename: string
}

// Minimal ZIP file builder - no external dependencies needed
// ZIP format: local file headers + file data + central directory + end record
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const localHeaders: Buffer[] = []
  const centralEntries: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf-8')

    // CRC-32 calculation
    const crc = crc32(file.data)

    // Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBuffer.length)
    localHeader.writeUInt32LE(0x04034b50, 0) // Local file header signature
    localHeader.writeUInt16LE(20, 4)          // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6)           // General purpose bit flag
    localHeader.writeUInt16LE(0, 8)           // Compression method (stored/no compression)
    localHeader.writeUInt16LE(0, 10)          // Last mod file time
    localHeader.writeUInt16LE(0, 12)          // Last mod file date
    localHeader.writeUInt32LE(crc, 14)        // CRC-32
    localHeader.writeUInt32LE(file.data.length, 18) // Compressed size
    localHeader.writeUInt32LE(file.data.length, 22) // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26) // File name length
    localHeader.writeUInt16LE(0, 28)          // Extra field length
    nameBuffer.copy(localHeader, 30)

    localHeaders.push(localHeader, file.data)

    // Central directory entry (46 bytes + name length)
    const centralEntry = Buffer.alloc(46 + nameBuffer.length)
    centralEntry.writeUInt32LE(0x02014b50, 0)  // Central directory header signature
    centralEntry.writeUInt16LE(20, 4)           // Version made by
    centralEntry.writeUInt16LE(20, 6)           // Version needed
    centralEntry.writeUInt16LE(0, 8)            // General purpose bit flag
    centralEntry.writeUInt16LE(0, 10)           // Compression method (stored)
    centralEntry.writeUInt16LE(0, 12)           // Last mod file time
    centralEntry.writeUInt16LE(0, 14)           // Last mod file date
    centralEntry.writeUInt32LE(crc, 16)         // CRC-32
    centralEntry.writeUInt32LE(file.data.length, 20)  // Compressed size
    centralEntry.writeUInt32LE(file.data.length, 24)  // Uncompressed size
    centralEntry.writeUInt16LE(nameBuffer.length, 28) // File name length
    centralEntry.writeUInt16LE(0, 30)           // Extra field length
    centralEntry.writeUInt16LE(0, 32)           // File comment length
    centralEntry.writeUInt16LE(0, 34)           // Disk number start
    centralEntry.writeUInt16LE(0, 36)           // Internal file attributes
    centralEntry.writeUInt32LE(0, 38)           // External file attributes
    centralEntry.writeUInt32LE(offset, 42)      // Relative offset of local header
    nameBuffer.copy(centralEntry, 46)

    centralEntries.push(centralEntry)

    offset += localHeader.length + file.data.length
  }

  const centralDirOffset = offset
  const centralDirSize = centralEntries.reduce((sum, e) => sum + e.length, 0)

  // End of central directory record (22 bytes)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)                // End of central directory signature
  endRecord.writeUInt16LE(0, 4)                          // Disk number
  endRecord.writeUInt16LE(0, 6)                          // Central directory disk number
  endRecord.writeUInt16LE(files.length, 8)               // Central directory entries on this disk
  endRecord.writeUInt16LE(files.length, 10)              // Total central directory entries
  endRecord.writeUInt32LE(centralDirSize, 12)            // Central directory size
  endRecord.writeUInt32LE(centralDirOffset, 16)          // Central directory offset
  endRecord.writeUInt16LE(0, 20)                         // Comment length

  return Buffer.concat([...localHeaders, ...centralEntries, endRecord])
}

// CRC-32 lookup table
const crc32Table = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { slides } = body as { slides: SlideExportData[] }

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json(
        { error: 'No slides provided' },
        { status: 400 }
      )
    }

    // Build ZIP from slide data
    const files = slides
      .filter(slide => slide.imageData && slide.filename)
      .map(slide => ({
        name: slide.filename,
        data: Buffer.from(slide.imageData, 'base64'),
      }))

    const zipBuffer = buildZip(files)

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="carousel-export.zip"',
        'Content-Length': zipBuffer.length.toString(),
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to export carousel' },
      { status: 500 }
    )
  }
}
