import cors from "cors";
import express from "express";
import { dnrpaRouter } from "./routes/dnrpa.js";
import { lubairesRouter } from "./routes/lubaires.js";
import { wegaRouter } from "./routes/wega.js";
import { framRouter } from "./routes/fram.js";
import { mannRouter } from "./routes/mann.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "renova-data-providers" });
  });

  app.use("/api/dnrpa", dnrpaRouter);
  app.use("/api/lubaires", lubairesRouter);
  app.use("/api/wega", wegaRouter);
  app.use("/api/fram", framRouter);
  app.use("/api/mann", mannRouter);

  return app;
}
