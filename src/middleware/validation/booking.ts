import { Request, Response, NextFunction } from "express";
import { z } from "zod";

const requiredString = (field: string) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? `${field} is required`
          : `${field} must be a string`,
    })
    .trim()
    .min(1, { error: `${field} cannot be empty` });

const bookingSchema = z.object(
  {
    slot_id: requiredString("slot_id"),
    name: requiredString("name"),
    email: requiredString("email")
      .toLowerCase()
      .pipe(z.email({ error: "email is invalid" })),
  },
  { error: "request body must be a JSON object" },
);

export const validateBooking = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const result = bookingSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return;
  }

  // Trimmed values, email lower-cased.
  req.body = result.data;
  next();
};
