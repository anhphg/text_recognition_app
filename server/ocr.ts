import { createWorker } from "tesseract.js";
import sharp from "sharp";

/**
 * OCR processing service using Tesseract.js
 */

let ocrWorker: Awaited<ReturnType<typeof createWorker>> | null = null;

/**
 * Initialize OCR worker (lazy initialization)
 */
async function getOcrWorker() {
  if (!ocrWorker) {
    try {
      ocrWorker = await createWorker("eng");
    } catch (error) {
      console.error("[OCR] Failed to initialize worker:", error);
      throw new Error("Failed to initialize OCR worker");
    }
  }
  return ocrWorker;
}

/**
 * Terminate OCR worker
 */
export async function terminateOcrWorker() {
  if (ocrWorker) {
    try {
      await ocrWorker.terminate();
      ocrWorker = null;
    } catch (error) {
      console.error("[OCR] Failed to terminate worker:", error);
    }
  }
}

/**
 * Process image and extract text using OCR
 * @param imageBuffer - Image file buffer
 * @param language - Language code (default: 'eng')
 * @returns Extracted text and metadata
 */
export async function processImageWithOcr(
  imageBuffer: Buffer,
  language: string = "eng"
) {
  const startTime = Date.now();

  try {
    // Validate image and optimize size if needed
    const optimizedBuffer = await optimizeImage(imageBuffer);

    // Get or initialize OCR worker
    const worker = await getOcrWorker();

    // Perform OCR recognition
    const result = await worker.recognize(optimizedBuffer);

    const processingTimeMs = Date.now() - startTime;

    return {
      text: result.data.text || "",
      confidence: Math.round((result.data.confidence || 0) * 100),
      language,
      processingTimeMs,
      success: true,
    };
  } catch (error) {
    console.error("[OCR] Processing failed:", error);
    const processingTimeMs = Date.now() - startTime;
    return {
      text: "",
      confidence: 0,
      language,
      processingTimeMs,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Optimize image for OCR processing
 * - Resize if too large
 * - Convert to grayscale for better OCR accuracy
 * - Ensure reasonable dimensions
 */
async function optimizeImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata();

    // If image is too large, resize it
    let pipeline = sharp(imageBuffer);

    if (metadata.width && metadata.width > 4000) {
      pipeline = pipeline.resize(4000, 4000, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Convert to grayscale for better OCR accuracy
    pipeline = pipeline.grayscale();

    return await pipeline.toBuffer();
  } catch (error) {
    console.warn("[OCR] Image optimization failed, using original:", error);
    return imageBuffer;
  }
}

/**
 * Validate image file
 */
export function validateImageFile(
  buffer: Buffer,
  mimeType: string,
  maxSizeBytes: number = 10 * 1024 * 1024 // 10MB default
): { valid: boolean; error?: string } {
  // Check file size
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${maxSizeBytes / 1024 / 1024}MB`,
    };
  }

  // Check MIME type
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
  if (!allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported image format. Allowed: ${allowedMimeTypes.join(", ")}`,
    };
  }

  return { valid: true };
}
