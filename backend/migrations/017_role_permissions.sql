-- ============================================================
-- Remedy — granular role → permission matrix (configurable by the owner).
-- The owner role is the super-user and is not stored (always allowed).
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  role       VARCHAR(30) NOT NULL,
  permission VARCHAR(50) NOT NULL,
  PRIMARY KEY (role, permission)
);
