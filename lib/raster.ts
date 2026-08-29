import sharp from "sharp";

export interface RasterPage {
  buffer: Buffer;
  width: number;
  height: number;
}

const MAX_PAGES = 20;

// Generate a placeholder PNG for a PDF page when native rasterization unavailable
async function generatePlaceholderPng(pageNum: number, total: number): Promise<RasterPage> {
  const width = 1200;
  const height = 1600;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="none" stroke="#e5e7eb" stroke-width="4" rx="24"/>
      <text x="${width / 2}" y="${height / 2 - 20}" font-family="Arial, sans-serif" font-size="32" fill="#6b7280" text-anchor="middle">PDF Page ${pageNum} of ${total}</text>
      <text x="${width / 2}" y="${height / 2 + 24}" font-family="Arial, sans-serif" font-size="18" fill="#9ca3af" text-anchor="middle">(raster fallback — install canvas for high-fidelity render)</text>
    </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, width, height };
}

/**
 * Rasterize a PDF buffer using mupdf (pure WASM, no native deps).
 * Falls back to placeholder PNGs if mupdf fails.
 */
async function rasterizePdfWithMupdf(fileBuffer: Buffer): Promise<RasterPage[]> {
  const mupdf = (await import("mupdf")).default;
  const doc = mupdf.Document.openDocument(fileBuffer, "application/pdf");
  const pageCount = doc.countPages();
  const count = Math.min(pageCount, MAX_PAGES);
  console.log(`[raster] mupdf: PDF has ${pageCount} pages, rasterizing ${count}`);

  const pages: RasterPage[] = [];
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    // Scale factor ~1.5 → ~144 DPI (72 dpi * 2)
    const scale = 2.0;
    const pixmap = page.toPixmap(
      [scale, 0, 0, scale, 0, 0],
      mupdf.ColorSpace.DeviceRGB,
      false, // alpha
      true   // showExtras (annotations)
    );
    const pngBytes: Uint8Array = pixmap.asPNG();
    const buf = Buffer.from(pngBytes);
    const width = pixmap.getWidth();
    const height = pixmap.getHeight();
    console.log(`[raster] mupdf page ${i + 1}: ${width}x${height} (${buf.length} bytes)`);
    pages.push({ buffer: buf, width, height });
  }
  return pages;
}

/**
 * Rasterize a file buffer to per-page PNGs with dimensions.
 * - PDF: uses mupdf (pure WASM) for high-fidelity rendering, falls back to placeholder PNGs
 * - Image (png/jpeg): normalizes via sharp to PNG, single page
 */
export async function rasterizeToPages(
  fileBuffer: Buffer,
  mimeType: string
): Promise<RasterPage[]> {
  const start = Date.now();
  const lower = mimeType.toLowerCase();

  if (lower === "application/pdf" || lower.includes("pdf")) {
    // Primary: mupdf (pure WASM, no native deps required)
    try {
      const pages = await rasterizePdfWithMupdf(fileBuffer);
      if (pages.length === 0) {
        throw new Error("mupdf rasterization produced 0 pages");
      }
      console.log(`[raster] PDF rasterized ${pages.length} pages in ${Date.now() - start}ms (mupdf)`);
      return pages;
    } catch (mupdfErr) {
      const mupdfMsg = (mupdfErr as Error).message || String(mupdfErr);
      console.warn(`[raster] mupdf failed (${mupdfMsg}), using placeholder PNGs`);

      // Tertiary fallback: placeholder PNGs via pdf-lib (pure JS, no native deps)
      try {
        const { PDFDocument } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const count = Math.min(pdfDoc.getPageCount(), MAX_PAGES);
        console.log(`[raster] placeholder fallback: PDF has ${pdfDoc.getPageCount()} pages, generating ${count} placeholders`);
        const pages: RasterPage[] = [];
        for (let i = 1; i <= count; i++) {
          pages.push(await generatePlaceholderPng(i, count));
        }
        console.log(`[raster] placeholder fallback generated ${pages.length} PNGs in ${Date.now() - start}ms`);
        return pages;
      } catch (fallbackErr) {
        console.error("[raster] placeholder fallback also failed", fallbackErr);
        throw mupdfErr; // throw original mupdf error
      }
    }
  }

  // Image path — single page
  if (
    lower.startsWith("image/") ||
    lower.includes("png") ||
    lower.includes("jpeg") ||
    lower.includes("jpg")
  ) {
    const image = sharp(fileBuffer);
    const meta = await image.metadata();
    const png = await sharp(fileBuffer).png().toBuffer();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    console.log(`[raster] Image rasterized 1 page: ${width}x${height} in ${Date.now() - start}ms`);
    return [{ buffer: png, width, height }];
  }

  throw new Error(`Unsupported MIME type for rasterization: ${mimeType}`);
}
