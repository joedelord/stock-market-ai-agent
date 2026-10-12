const express = require("express");

const {
  getUsers,
  getUserById,
  createUser,
  updateUserRole,
  deleteUser,
} = require("../controllers/userController");

const { requireAuth, requireRole } = require("../middleware/authMiddleware");

const validate = require("../middleware/validate");

const {
  listUsersSchema,
  userIdSchema,
  updateUserRoleSchema,
  createUserSchema,
} = require("../validations/userSchemas");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  requireRole("admin", "moderator"),
  validate(listUsersSchema),
  getUsers,
);

router.get(
  "/:id",
  requireRole("admin", "moderator"),
  validate(userIdSchema),
  getUserById,
);

router.patch(
  "/:id/role",
  requireRole("admin"),
  validate(updateUserRoleSchema),
  updateUserRole,
);

router.delete("/:id", requireRole("admin"), validate(userIdSchema), deleteUser);

router.post("/", requireRole("admin"), validate(createUserSchema), createUser);

module.exports = router;
