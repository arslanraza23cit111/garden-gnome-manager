import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  BookOpen,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  RotateCcw,
  Sprout,
} from "lucide-react";
import { clearSession, getUser } from "../api/client.js";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/products", label: "Products", icon: Package },
  { to: "/purchases", label: "Purchase", icon: ShoppingCart },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/purchase-returns", label: "Purchase returns", icon: RotateCcw },
  { to: "/sale-returns", label: "Sale returns", icon: RotateCcw },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/accounts", label: "Accounts", icon: BookOpen, phase: 3 },
  { to: "/reports", label: "Reports", icon: BarChart3, phase: 4 },
  { to: "/settings", label: "Settings", icon: Settings, phase: 2 },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const user = getUser();

  return (
    <aside className="no-print flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <Sprout size={18} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-800">AgroShop</p>
          <p className="text-[11px] text-slate-500">Offline • Local PC</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {NAV.map(({ to, label, icon: Icon, end, phase }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {phase && (
              <span className="badge bg-slate-100 text-[10px] text-slate-400">P{phase}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">{user?.full_name || user?.username}</p>
        <p className="mb-2 text-xs capitalize text-slate-500">{user?.role}</p>
        <button
          className="btn-ghost w-full"
          onClick={() => {
            clearSession();
            navigate("/login");
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  );
}
