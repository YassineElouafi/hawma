/** Staff RBAC (docs §7.4, §9.3). Least privilege: roles map to explicit permissions. */
export const ROLES = ["support", "trust_safety", "city_ops", "finance", "catalogue", "admin", "read_only"] as const;
export type Role = (typeof ROLES)[number];
export type Permission =
  | "users.read" | "users.suspend" | "kyc.read" | "kyc.review" | "bookings.read" | "bookings.cancel"
  | "disputes.resolve" | "refunds.issue" | "payouts.approve" | "catalogue.edit" | "audit.read" | "staff.manage";

const READ: Permission[] = ["users.read", "kyc.read", "bookings.read"];
export const PERMISSIONS: Record<Role, Permission[]> = {
  read_only: READ,
  support: [...READ, "bookings.cancel", "disputes.resolve"],
  trust_safety: [...READ, "users.suspend", "kyc.review", "disputes.resolve", "audit.read"],
  city_ops: [...READ, "kyc.review", "bookings.cancel", "catalogue.edit"],
  finance: [...READ, "refunds.issue", "payouts.approve", "audit.read"],
  catalogue: ["catalogue.edit", "bookings.read"],
  admin: ["users.read", "users.suspend", "kyc.read", "kyc.review", "bookings.read", "bookings.cancel", "disputes.resolve", "refunds.issue", "payouts.approve", "catalogue.edit", "audit.read", "staff.manage"],
};
export const can = (roles: readonly Role[], p: Permission) => roles.some((r) => PERMISSIONS[r]?.includes(p));

/** Actions that must carry a human-written reason and are audit-logged with it. */
export const REASON_REQUIRED: Permission[] = ["users.suspend", "kyc.review", "bookings.cancel", "disputes.resolve", "refunds.issue", "payouts.approve"];
/** Money movements above this need a second approver (four-eyes), docs §7.4. */
export const FOUR_EYES_THRESHOLD_CENTIMES = 100_000;
