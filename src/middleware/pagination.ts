import { Request, Response, NextFunction } from "express";
import { z } from "zod";

const paginationSchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const validatePagination = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const result = paginationSchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({
      error: "limit must be an integer from 1 to 50, and cursor must come from next_cursor",
    });
    return;
  }

  // Express 5's req.query is read-only, so hand the parsed values over via res.locals.
  res.locals.pagination = result.data;
  next();
};
