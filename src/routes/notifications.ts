import { Router, type Request, type Response } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { resolveDataScope } from "../shared/scope/dataScope.js";

export const notificationsRouter = Router();

// Secure all routes in this router to authenticated users
notificationsRouter.use(requireAuth);

// Get notifications for current user or general HQ announcements
notificationsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const scope = resolveDataScope(user);
    const userId = user?.id;
    if (!userId) {
      res.json([]);
      return;
    }
    const where = scope.unrestricted
      ? { OR: [{ userId }, { userId: "HQ" }] }
      : { userId };

    const list = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
notificationsRouter.post("/:id/read", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const user = (req as any).user;
    const scope = resolveDataScope(user);
    const userId = user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing || (!scope.unrestricted && existing.userId !== userId)) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    const updated = await db.notification.update({
      where: { id },
      data: { read: true }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
notificationsRouter.post("/read-all", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const scope = resolveDataScope(user);
    const userId = user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const where = scope.unrestricted
      ? { OR: [{ userId }, { userId: "HQ" }], read: false }
      : { userId, read: false };

    const updated = await db.notification.updateMany({
      where,
      data: { read: true }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all notifications
notificationsRouter.delete("/clear-all", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const scope = resolveDataScope(user);
    const userId = user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const where = scope.unrestricted
      ? { OR: [{ userId }, { userId: "HQ" }] }
      : { userId };

    const deleted = await db.notification.deleteMany({
      where
    });
    res.json(deleted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Broadcast system announcement (HQ only)
notificationsRouter.post("/broadcast", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, message, type, link } = req.body;
    const notification = await db.notification.create({
      data: {
        userId: "HQ",
        title: title || "System Announcement",
        message: message || "",
        type: type || "SYSTEM_ANNOUNCEMENT",
        link: link || "/dashboard",
        read: false
      }
    });
    res.json(notification);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
