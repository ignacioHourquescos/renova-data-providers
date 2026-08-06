import cors from "cors";
import express from "express";
import { dnrpaRouter } from "./routes/dnrpa.js";
import { lubairesRouter } from "./routes/lubaires.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "renova-data-providers" });
  });

  app.use("/api/dnrpa", dnrpaRouter);
  app.use("/api/lubaires", lubairesRouter);

  return app;
}
