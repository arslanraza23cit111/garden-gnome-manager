import express from "express";
import cors from "cors";
import { getDb } from "./db/connection.js";
import { requireAuth } from "./lib/auth.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import productUnitRoutes from "./routes/productUnits.js";
import purchaseRoutes from "./routes/purchases.js";
import saleRoutes from "./routes/sales.js";
import customerRoutes from "./routes/customers.js";
import supplierRoutes from "./routes/suppliers.js";
import returnsRoutes from "./routes/returns.js";
import paymentRoutes from "./routes/payments.js";
import expenseRoutes from "./routes/expenses.js";
import dashboardRoutes from "./routes/dashboard.js";
import settingsRoutes from "./routes/settings.js";

export function createApp() {
  getDb();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, offline: true }));
  app.use("/api/auth", authRoutes);

  // Everything below requires a local sign-in.
  app.use("/api/products/:productId/units", requireAuth, productUnitRoutes);
  app.use("/api/products", requireAuth, productRoutes);
  app.use("/api/purchases", requireAuth, purchaseRoutes);
  app.use("/api/sales", requireAuth, saleRoutes);
  app.use("/api/customers", requireAuth, customerRoutes);
  app.use("/api/suppliers", requireAuth, supplierRoutes);
  app.use("/api", requireAuth, returnsRoutes);
  app.use("/api/payments", requireAuth, paymentRoutes);
  app.use("/api/expenses", requireAuth, expenseRoutes);
  app.use("/api/dashboard", requireAuth, dashboardRoutes);
  app.use("/api/settings", requireAuth, settingsRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint" }));

  // Single error shape for the frontend.
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (/required|cannot|Insufficient|Not enough|exceed/i.test(err.message) ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || "Unexpected server error" });
  });

  return app;
}
