import express from "express";
import cors from "cors";
import { getDb } from "./db/connection.js";
import { requireAuth, requireRouteRole, requireRole } from "./lib/auth.js";
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
import userRoutes from "./routes/users.js";
import activityLogRoutes from "./routes/activityLog.js";

const full = (...roles) => ({ full: ["admin", "manager", ...roles] });
const fullRead = (writeRoles, readRoles) => ({
  full: ["admin", "manager", ...writeRoles],
  read: readRoles,
});

export function createApp() {
  getDb();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, offline: true }));
  app.use("/api/auth", authRoutes);

  // Everything below requires a local sign-in.
  app.use("/api/products/:productId/units", requireAuth, requireRouteRole(fullRead(["storekeeper"], ["salesman", "accountant"])), productUnitRoutes);
  app.use("/api/products", requireAuth, requireRouteRole(fullRead(["storekeeper"], ["salesman", "accountant"])), productRoutes);
  app.use("/api/purchases", requireAuth, requireRouteRole(fullRead(["storekeeper"], ["accountant"])), purchaseRoutes);
  app.use("/api/sales", requireAuth, requireRouteRole(fullRead(["salesman"], ["storekeeper", "accountant"])), saleRoutes);
  app.use("/api/customers", requireAuth, requireRouteRole(fullRead([], ["salesman", "accountant"])), customerRoutes);
  app.use("/api/suppliers", requireAuth, requireRouteRole(fullRead([], ["accountant"])), supplierRoutes);
  app.use("/api/purchase-returns", requireAuth, requireRouteRole(fullRead(["storekeeper"], ["accountant"])));
  app.use("/api/sale-returns", requireAuth, requireRouteRole(fullRead(["salesman"], ["storekeeper", "accountant"])));
  app.use("/api", requireAuth, returnsRoutes);
  app.use("/api/payments", requireAuth, requireRouteRole(full(["accountant"])), paymentRoutes);
  app.use("/api/expenses", requireAuth, requireRouteRole(full(["accountant"])), expenseRoutes);
  app.use("/api/dashboard", requireAuth, requireRouteRole(full(["accountant"])), dashboardRoutes);
  app.use("/api/users", requireAuth, requireRole("admin"), userRoutes);
  app.use("/api/activity-log", requireAuth, requireRole("admin"), activityLogRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint" }));

  // Single error shape for the frontend.
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (/required|cannot|Insufficient|Not enough|exceed/i.test(err.message) ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || "Unexpected server error" });
  });

  return app;
}
