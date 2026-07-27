import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import { getToken } from "./api/client.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Purchases from "./pages/Purchases.jsx";
import Sales from "./pages/Sales.jsx";
import Customers from "./pages/Customers.jsx";
import Suppliers from "./pages/Suppliers.jsx";
import PurchaseReturns from "./pages/PurchaseReturns.jsx";
import SaleReturns from "./pages/SaleReturns.jsx";
import Payments from "./pages/Payments.jsx";
import Expenses from "./pages/Expenses.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";

function Shell({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  if (location.pathname === "/login") return <Login />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/purchase-returns" element={<PurchaseReturns />} />
        <Route path="/sale-returns" element={<SaleReturns />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route
          path="/accounts"
          element={<ComingSoon title="Accounts & Ledger" phase={3} detail="General ledger, trial balance, P&L and balance sheet, all derived from the ledger_entries table that Phase 1 is already writing." />}
        />
        <Route
          path="/reports"
          element={<ComingSoon title="Reports & Analytics" phase={4} detail="Sales, purchase, stock, expiry, profit and outstanding reports with CSV/PDF export." />}
        />
        <Route
          path="/settings"
          element={<ComingSoon title="Settings & Backup" phase={2} detail="Shop details on invoices, print mode, user password, and the manual “Backup now” copy of the SQLite file." />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
