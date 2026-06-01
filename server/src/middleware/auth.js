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
    req.business = user.business;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid authorization token" });
  }
}
