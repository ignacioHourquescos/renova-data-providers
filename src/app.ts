import express from "express";
import { dnrpaRouter } from "./routes/dnrpa.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "renova-data-providers" });
  });

  app.use("/api/dnrpa", dnrpaRouter);

  return app;
}
