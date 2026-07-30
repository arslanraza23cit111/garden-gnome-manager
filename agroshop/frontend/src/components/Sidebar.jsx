import { NavLink, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../api/client.js";
import { canAccess } from "../lib/roles.js";

const NAV = [
  { to: "/", label: "Dashboard", area: "dashboard", end: true },
  { to: "/products", label: "Products", area: "products" },
  { to: "/purchases", label: "Purchases", area: "purchases" },
  { to: "/sales", label: "Sales", area: "sales" },
  { to: "/customers", label: "Customers", area: "customers" },
  { to: "/suppliers", label: "Suppliers", area: "suppliers" },
  { to: "/purchase-returns", label: "Purchase Returns", area: "purchase-returns" },
  { to: "/sale-returns", label: "Sale Returns", area: "sale-returns" },
  { to: "/payments", label: "Payments", area: "payments" },
  { to: "/expenses", label: "Expenses", area: "expenses" },
  { to: "/employees", label: "Employees", area: "employees" },
  { to: "/accounts", label: "Accounts", area: "accounts" },
  { to: "/reports", label: "Reports", area: "reports" },
  { to: "/users", label: "Users", area: "users" },
  { to: "/activity-log", label: "Activity Log", area: "activity-log" },
  { to: "/settings", label: "Settings", area: "settings" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const user = getUser();
  const role = user?.role;
  const items = NAV.filter((item) => canAccess(role, item.area));

  const logout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="no-print flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-lg font-semibold text-emerald-700">AgroShop</div>
        <div className="text-xs text-slate-500">Fertilizer &amp; Pesticides</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-5 py-3">
        <div className="text-sm font-medium text-slate-800">{user?.full_name || user?.username}</div>
        <div className="text-xs capitalize text-slate-500">{role}</div>
        <button
          type="button"
          onClick={logout}
          className="mt-2 text-xs font-medium text-rose-600 hover:underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
