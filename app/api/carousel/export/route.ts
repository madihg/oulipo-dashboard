import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import { PassThrough } from 'stream'

interface SlideExportData {
  imageData: string  // base64 PNG data
  filename: string
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

    // Create ZIP archive in memory
    const archive = archiver('zip', { zlib: { level: 6 } })
    const passThrough = new PassThrough()

    // Collect chunks into a buffer
    const chunks: Buffer[] = []
    passThrough.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

    const archiveFinished = new Promise<Buffer>((resolve, reject) => {
      passThrough.on('end', () => resolve(Buffer.concat(chunks)))
      passThrough.on('error', reject)
      archive.on('error', reject)
    })

    archive.pipe(passThrough)

    // Add each slide as a PNG file
    for (const slide of slides) {
      if (!slide.imageData || !slide.filename) continue
      const buffer = Buffer.from(slide.imageData, 'base64')
      archive.append(buffer, { name: slide.filename })
    }

    await archive.finalize()
    const zipBuffer = await archiveFinished

    return new NextResponse(zipBuffer, {
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
