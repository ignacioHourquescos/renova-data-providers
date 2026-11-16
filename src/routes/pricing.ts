import { Router } from "express";
import { getPricingCatalog } from "../providers/pricing.js";

export const pricingRouter = Router();

/** Tabla de descuentos y markups por lista/proveedor (solo lectura; se edita en código). */
pricingRouter.get("/", (_req, res) => {
  return res.json(getPricingCatalog());
});
