import jwt from "jsonwebtoken";
import { prisma } from "../prisma/client.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing authorization token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { business: { include: { subscriptionPlan: true, serviceTypes: true, availability: true } } }
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid authorization token" });
    }

    req.user = user;

    if (user.business) {
      req.business = user.business;
    } else if (user.staffBusinessId) {
      req.business = await prisma.business.findUnique({
        where: { id: user.staffBusinessId },
        include: { serviceTypes: true, subscriptionPlan: true, availability: true }
      });
    } else if (user.role === "owner") {
      // Business may not have been created yet — create it now so the app works
      const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });
      if (existing) {
        req.business = existing;
      } else {
        req.business = await prisma.business.create({
          data: {
            ownerId: user.id,
            name: user.name ? `${user.name}'s Business` : "My Business",
            industryType: "General Contractor",
            ownerNotificationEmail: user.email,
            serviceAreas: [],
            businessHours: {
              monday: "8:00 AM - 5:00 PM",
              tuesday: "8:00 AM - 5:00 PM",
              wednesday: "8:00 AM - 5:00 PM",
              thursday: "8:00 AM - 5:00 PM",
              friday: "8:00 AM - 5:00 PM"
            },
            availability: {
              createMany: {
                data: [1, 2, 3, 4, 5].flatMap((d) => [
                  { dayOfWeek: d, startTime: "09:00", endTime: "12:00", slotMinutes: 60 },
                  { dayOfWeek: d, startTime: "13:00", endTime: "17:00", slotMinutes: 60 }
                ])
              }
            }
          },
          include: { serviceTypes: true, subscriptionPlan: true, availability: true }
        });
        console.log(`[auth] Auto-created missing business for user ${user.id}`);
      }
    } else {
      req.business = null;
    }

    return next();
  } catch (error) {
    console.error("[auth] requireAuth error:", error.message);
    return res.status(401).json({ error: "Invalid authorization token" });
  }
}
