import { NextFunction, Request, Response } from "express";

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable is required");
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.get("X-API-Key") !== API_KEY) {
    res.status(401).json({ error: "missing or invalid API key" });
    return;
  }

  next();
};
