import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import type { ZodSchema } from "zod";

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as any;
      req.body = parsed.body;
      req.query = parsed.query as any;
      req.params = parsed.params as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.issues.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      return res.status(500).json({ error: "Internal server error during validation" });
    }
  };
};
