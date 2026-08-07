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
      if (parsed.body !== undefined) {
        req.body = parsed.body;
      }
      if (parsed.query !== undefined) {
        Object.keys(req.query).forEach(key => delete req.query[key]);
        Object.assign(req.query, parsed.query);
      }
      if (parsed.params !== undefined) {
        Object.keys(req.params).forEach(key => delete req.params[key]);
        Object.assign(req.params, parsed.params);
      }
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
      
      // Fallback check if it's a ZodError from a different instance
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
         return res.status(400).json({
          error: "Validation failed",
          details: (error as any).issues?.map((e: any) => ({
            path: e.path?.join("."),
            message: e.message,
          })),
        });
      }

      console.error("Validation Middleware Error:", error);
      return res.status(500).json({ 
        error: "Internal server error during validation", 
        message: error instanceof Error ? error.message : String(error),
        details: error 
      });
    }
  };
};
