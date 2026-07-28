import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import { getToken, getUser } from "./api/client.js";
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
import Employees from "./pages/Employees.jsx";
import Users from "./pages/Users.jsx";
import ActivityLog from "./pages/ActivityLog.jsx";
import Accounts from "./pages/Accounts.jsx";
import Settings from "./pages/Settings.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";
import { canAccess } from "./lib/roles.js";

const FIRST_PATH = {
  admin: "/",
  manager: "/",
  accountant: "/",
  salesman: "/sales",
  storekeeper: "/products",
};

function Shell({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
    </div>
  );
}

function ProtectedPage({ area, children }) {
  const role = getUser()?.role;
  if (!canAccess(role, area)) return <Navigate to={FIRST_PATH[role] || "/login"} replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  if (location.pathname === "/login") return <Login />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<ProtectedPage area="dashboard"><Dashboard /></ProtectedPage>} />
        <Route path="/products" element={<ProtectedPage area="products"><Products /></ProtectedPage>} />
        <Route path="/purchases" element={<ProtectedPage area="purchases"><Purchases /></ProtectedPage>} />
        <Route path="/sales" element={<ProtectedPage area="sales"><Sales /></ProtectedPage>} />
        <Route path="/customers" element={<ProtectedPage area="customers"><Customers /></ProtectedPage>} />
        <Route path="/suppliers" element={<ProtectedPage area="suppliers"><Suppliers /></ProtectedPage>} />
        <Route path="/purchase-returns" element={<ProtectedPage area="purchase-returns"><PurchaseReturns /></ProtectedPage>} />
        <Route path="/sale-returns" element={<ProtectedPage area="sale-returns"><SaleReturns /></ProtectedPage>} />
        <Route path="/payments" element={<ProtectedPage area="payments"><Payments /></ProtectedPage>} />
        <Route path="/expenses" element={<ProtectedPage area="expenses"><Expenses /></ProtectedPage>} />
        <Route path="/employees" element={<ProtectedPage area="employees"><Employees /></ProtectedPage>} />
        <Route path="/accounts" element={<ProtectedPage area="accounts"><Accounts /></ProtectedPage>} />
        <Route
          path="/reports"
          element={
            <ProtectedPage area="reports">
              <ComingSoon title="Reports & Analytics" phase={4} detail="Sales, purchase, stock, expiry, profit and outstanding reports with CSV/PDF export." />
            </ProtectedPage>
          }
        />
        <Route path="/users" element={<ProtectedPage area="users"><Users /></ProtectedPage>} />
        <Route path="/activity-log" element={<ProtectedPage area="activity-log"><ActivityLog /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage area="settings"><Settings /></ProtectedPage>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
