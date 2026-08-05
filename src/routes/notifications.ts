import { Router, type Request, type Response } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, requireRole } from "../middleware/auth.middleware.js";

export const notificationsRouter = Router();

// Secure all routes in this router to authenticated users
notificationsRouter.use(requireAuth);

// Get notifications for current user or general HQ announcements
notificationsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || "HQ";
    const list = await db.notification.findMany({
      where: {
        OR: [
          { userId },
          { userId: "HQ" }
        ]
      },
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
    const userId = (req as any).user?.id || "HQ";
    const updated = await db.notification.updateMany({
      where: {
        OR: [{ userId }, { userId: "HQ" }],
        read: false
      },
      data: { read: true }
    });
    res.json(updated);
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
