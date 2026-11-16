import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3100),
  RECAPTCHA_SOLVER_API_KEY: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),
  /** Si está vacío, se usa la clave de `providers.eagle` en config.ts. */
  EAGLE_API_KEY: z.string().optional().default(""),
  EAGLE_BASE_URL: z.string().optional().default(""),
  /** Si están vacíos, se usan los valores de `providers.maxoil` en config.ts. */
  MAXOIL_CLIENT_CODE: z.string().optional().default(""),
  MAXOIL_TOKEN: z.string().optional().default(""),
});

export const env = envSchema.parse(process.env);
