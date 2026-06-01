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
      include: { business: { include: { subscriptionPlan: true } } }
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid authorization token" });
    }

    req.user = user;
    // Owners have their own business; staff members are linked via staffBusinessId
    if (user.business) {
      req.business = user.business;
    } else if (user.staffBusinessId) {
      req.business = await prisma.business.findUnique({
        where: { id: user.staffBusinessId },
        include: { serviceTypes: true, subscriptionPlan: true }
      });
    } else {
      req.business = null;
    }
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid authorization token" });
  }
}
