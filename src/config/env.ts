import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3100),
  RECAPTCHA_SOLVER_API_KEY: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),
});

export const env = envSchema.parse(process.env);
