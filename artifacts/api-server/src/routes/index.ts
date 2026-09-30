import { Router, type IRouter } from "express";
import healthRouter from "./health";
import competitionRouter from "./competition";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(competitionRouter);

export default router;
