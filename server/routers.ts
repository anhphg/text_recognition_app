import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getUserOcrResults, saveOcrResult, deleteOcrResult } from "./db";
import { processImageWithOcr, validateImageFile } from "./ocr";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  ocr: router({
    /**
     * Upload image and perform OCR
     */
    processImage: protectedProcedure
      .input(
        z.object({
          imageData: z.string(), // Base64 encoded image
          fileName: z.string().min(1),
          mimeType: z.string(),
          language: z.string().default("eng"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          // Decode base64 image
          const imageBuffer = Buffer.from(input.imageData, "base64");

          // Validate image
          const validation = validateImageFile(imageBuffer, input.mimeType);
          if (!validation.valid) {
            throw new Error(validation.error || "Invalid image");
          }

          // Process image with OCR
          const ocrResult = await processImageWithOcr(imageBuffer, input.language);

          if (!ocrResult.success) {
            throw new Error(ocrResult.error || "OCR processing failed");
          }

          // Upload image to S3
          const fileKey = `ocr/${ctx.user.id}/${nanoid()}-${input.fileName}`;
          const { url: imageUrl } = await storagePut(
            fileKey,
            imageBuffer,
            input.mimeType
          );

          // Save result to database
          await saveOcrResult({
            userId: ctx.user.id,
            imageFileName: input.fileName,
            imageUrl,
            extractedText: ocrResult.text,
            confidence: ocrResult.confidence,
            language: input.language,
            processingTimeMs: ocrResult.processingTimeMs,
          });

          return {
            success: true,
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            processingTimeMs: ocrResult.processingTimeMs,
            imageUrl,
          };
        } catch (error) {
          console.error("[OCR] Processing failed:", error);
          throw new Error(
            error instanceof Error ? error.message : "Failed to process image"
          );
        }
      }),

    /**
     * Get user's OCR history
     */
    getHistory: protectedProcedure.query(async ({ ctx }) => {
      try {
        const results = await getUserOcrResults(ctx.user.id);
        return results;
      } catch (error) {
        console.error("[OCR] Failed to get history:", error);
        throw new Error("Failed to retrieve OCR history");
      }
    }),

    /**
     * Delete OCR result
     */
    deleteResult: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await deleteOcrResult(input.id, ctx.user.id);
          return { success: true };
        } catch (error) {
          console.error("[OCR] Failed to delete result:", error);
          throw new Error("Failed to delete OCR result");
        }
      }),

    /**
     * Process multiple images in batch
     */
    processBatch: protectedProcedure
      .input(
        z.object({
          images: z.array(
            z.object({
              imageData: z.string(),
              fileName: z.string().min(1),
              mimeType: z.string(),
              language: z.string().default("eng"),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const results = [];
        const errors = [];

        for (let i = 0; i < input.images.length; i++) {
          const image = input.images[i];
          try {
            // Decode base64 image
            const imageBuffer = Buffer.from(image.imageData, "base64");

            // Validate image
            const validation = validateImageFile(imageBuffer, image.mimeType);
            if (!validation.valid) {
              errors.push({
                fileName: image.fileName,
                error: validation.error || "Invalid image",
              });
              continue;
            }

            // Process image with OCR
            const ocrResult = await processImageWithOcr(imageBuffer, image.language);

            if (!ocrResult.success) {
              errors.push({
                fileName: image.fileName,
                error: ocrResult.error || "OCR processing failed",
              });
              continue;
            }

            // Upload image to S3
            const fileKey = `ocr/${ctx.user.id}/${nanoid()}-${image.fileName}`;
            const { url: imageUrl } = await storagePut(
              fileKey,
              imageBuffer,
              image.mimeType
            );

            // Save result to database
            await saveOcrResult({
              userId: ctx.user.id,
              imageFileName: image.fileName,
              imageUrl,
              extractedText: ocrResult.text,
              confidence: ocrResult.confidence,
              language: image.language,
              processingTimeMs: ocrResult.processingTimeMs,
            });

            results.push({
              fileName: image.fileName,
              text: ocrResult.text,
              confidence: ocrResult.confidence,
              processingTimeMs: ocrResult.processingTimeMs,
              imageUrl,
              success: true,
            });
          } catch (error) {
            console.error("[OCR] Batch processing failed for", image.fileName, error);
            errors.push({
              fileName: image.fileName,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        return {
          success: true,
          results,
          errors,
          totalProcessed: results.length,
          totalFailed: errors.length,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
