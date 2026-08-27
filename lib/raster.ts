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
 * Rasterize a file buffer to per-page PNGs with dimensions.
 * - PDF: uses pdf-to-img with scale 2 (~192 DPI), falls back to placeholder via pdf-lib + sharp if canvas unavailable
 * - Image (png/jpeg): normalizes via sharp to PNG, single page
 */
export async function rasterizeToPages(
  fileBuffer: Buffer,
  mimeType: string
): Promise<RasterPage[]> {
  const start = Date.now();
  const lower = mimeType.toLowerCase();

  if (lower === "application/pdf" || lower.includes("pdf")) {
    try {
      // Dynamic import so failures don't break image path
      const { pdf } = await import("pdf-to-img");
      const doc = await pdf(fileBuffer, { scale: 2 });
      const pages: RasterPage[] = [];
      let pageNum = 0;

      for await (const raw of doc) {
        pageNum++;
        if (pageNum > MAX_PAGES) {
          console.warn(`[raster] PDF exceeds ${MAX_PAGES} pages, truncating at page ${pageNum}`);
          break;
        }
        const meta = await sharp(raw).metadata();
        const png = await sharp(raw).png().toBuffer();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        console.log(`[raster] PDF page ${pageNum}: ${width}x${height} (${png.length} bytes)`);
        pages.push({ buffer: png, width, height });
      }

      if (pages.length === 0) {
        throw new Error("PDF rasterization produced 0 pages");
      }
      console.log(`[raster] PDF rasterized ${pages.length} pages in ${Date.now() - start}ms (scale 2)`);
      return pages;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // Fallback for canvas native module missing or other pdf-to-img failures
      if (msg.includes("canvas") || msg.includes("MODULE_NOT_FOUND") || msg.includes("canvas.node")) {
        console.warn(`[raster] pdf-to-img failed due to missing canvas (${msg}), falling back to placeholder PNGs`);
      } else {
        console.warn(`[raster] pdf-to-img failed (${msg}), attempting placeholder fallback`);
      }
      // Use pdf-lib to get page count without native deps
      try {
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(fileBuffer);
        const count = Math.min(doc.getPageCount(), MAX_PAGES);
        console.log(`[raster] fallback: PDF has ${doc.getPageCount()} pages, generating ${count} placeholders`);
        const pages: RasterPage[] = [];
        for (let i = 1; i <= count; i++) {
          pages.push(await generatePlaceholderPng(i, count));
        }
        console.log(`[raster] fallback generated ${pages.length} placeholder PNGs in ${Date.now() - start}ms`);
        return pages;
      } catch (fallbackErr) {
        console.error("[raster] fallback also failed", fallbackErr);
        throw e; // throw original
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
