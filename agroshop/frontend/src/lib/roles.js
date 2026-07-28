export const ROLES = ["admin", "manager", "accountant", "salesman", "storekeeper"];

const ACCESS = {
  dashboard: { full: ["admin", "manager", "accountant"], read: [] },
  products: { full: ["admin", "manager", "storekeeper"], read: ["salesman", "accountant"] },
  purchases: { full: ["admin", "manager", "storekeeper"], read: ["accountant"] },
  sales: { full: ["admin", "manager", "salesman"], read: ["storekeeper", "accountant"] },
  customers: { full: ["admin", "manager"], read: ["salesman", "accountant"] },
  suppliers: { full: ["admin", "manager"], read: [] },
  "purchase-returns": { full: ["admin", "manager", "storekeeper"], read: ["accountant"] },
  "sale-returns": { full: ["admin", "manager", "salesman"], read: ["storekeeper", "accountant"] },
  payments: { full: ["admin", "manager", "accountant"], read: [] },
  expenses: { full: ["admin", "manager", "accountant"], read: [] },
  accounts: { full: ["admin", "manager", "accountant"], read: [] },
  reports: { full: ["admin", "manager", "accountant"], read: [] },
  settings: { full: ["admin", "manager"], read: [] },
  users: { full: ["admin"], read: [] },
  "activity-log": { full: ["admin"], read: [] },
};

export function canAccess(role, area) {
  const access = ACCESS[area];
  if (!access) return role === "admin" || role === "manager";
  return access.full.includes(role) || access.read.includes(role);
}

export function canWrite(role, area) {
  return ACCESS[area]?.full.includes(role) ?? (role === "admin" || role === "manager");
}
