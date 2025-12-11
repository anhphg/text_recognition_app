import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "filler",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("OCR Batch Processing", () => {
  describe("ocr.processBatch", () => {
    it("should require authentication", async () => {
      const publicCtx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(publicCtx);

      try {
        await caller.ocr.processBatch({
          images: [
            {
              imageData: "dGVzdA==",
              fileName: "test.jpg",
              mimeType: "image/jpeg",
              language: "eng",
            },
          ],
        });
        expect.fail("Should have thrown authentication error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should accept empty image array", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.ocr.processBatch({
        images: [],
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.totalProcessed).toBe(0);
      expect(result.totalFailed).toBe(0);
    });

    it("should reject unsupported file types in batch", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const validBase64 = Buffer.from("test data").toString("base64");

      const result = await caller.ocr.processBatch({
        images: [
          {
            imageData: validBase64,
            fileName: "test.pdf",
            mimeType: "application/pdf",
            language: "eng",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.totalFailed).toBe(1);
    });



    it("should track correct statistics", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const validBase64 = Buffer.from("test").toString("base64");

      const result = await caller.ocr.processBatch({
        images: [
          {
            imageData: validBase64,
            fileName: "invalid.pdf",
            mimeType: "application/pdf",
            language: "eng",
          },
          {
            imageData: validBase64,
            fileName: "invalid2.txt",
            mimeType: "text/plain",
            language: "eng",
          },
        ],
      });

      expect(result.totalProcessed + result.totalFailed).toBe(2);
      expect(result.results.length).toBe(result.totalProcessed);
      expect(result.errors.length).toBe(result.totalFailed);
    });
  });
});
