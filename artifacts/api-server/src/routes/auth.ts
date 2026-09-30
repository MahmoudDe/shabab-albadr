import { Router, type IRouter } from "express";
import { LoginBody } from "@workspace/api-zod";
import { findTrainer } from "../lib/sheets";
import { issueTrainerToken } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res, next) => {
  try {
    const input = LoginBody.parse(req.body);
    const trainer = await findTrainer(input.username, input.pin);
    if (!trainer) {
      res.status(401).json({ error: "اسم المستخدم أو الرقم السري غير صحيح" });
      return;
    }
    const token = issueTrainerToken({
      username: trainer.username,
      name: trainer.name,
      role: trainer.role,
      teamId: trainer.teamId,
    });
    res.json({
      token,
      name: trainer.name,
      username: trainer.username,
      role: trainer.role,
      teamId: trainer.teamId ?? null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
