import { describe, expect, it } from "vitest";
import { validateImageFile } from "./ocr";

describe("OCR Service", () => {
  describe("validateImageFile", () => {
    it("should accept valid image files", () => {
      const buffer = Buffer.from("fake image data");
      const result = validateImageFile(buffer, "image/jpeg", 10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it("should reject unsupported MIME types", () => {
      const buffer = Buffer.from("fake data");
      const result = validateImageFile(buffer, "application/pdf");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported image format");
    });

    it("should reject files exceeding size limit", () => {
      const buffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      const result = validateImageFile(buffer, "image/jpeg", 10 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum");
    });

    it("should accept files within size limit", () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
      const result = validateImageFile(buffer, "image/png", 10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it("should accept all supported image formats", () => {
      const buffer = Buffer.from("fake image");
      const formats = ["image/jpeg", "image/png", "image/webp", "image/tiff"];

      formats.forEach((format) => {
        const result = validateImageFile(buffer, format);
        expect(result.valid).toBe(true);
      });
    });

    it("should reject video formats", () => {
      const buffer = Buffer.from("fake data");
      const result = validateImageFile(buffer, "video/mp4");
      expect(result.valid).toBe(false);
    });

    it("should reject text formats", () => {
      const buffer = Buffer.from("fake data");
      const result = validateImageFile(buffer, "text/plain");
      expect(result.valid).toBe(false);
    });
  });
});
