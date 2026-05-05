import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware";
import { generateCaption } from "./ai.controller";

const router = Router();
router.post("/caption", verifyJWT, generateCaption);

export default router;
