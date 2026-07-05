import { Router } from "express";
import { countObjectsInImage, isStockCountModelLoaded, reloadStockCountModel, getLoadStatusReason, listAvailableModels, getCurrentYoloModel, getStockCountBackend } from "../stockCounter";

const router = Router();

router.get("/api/stock-count/status", (_req, res) => {
  const ready = isStockCountModelLoaded();
  res.json({ ready, reason: getLoadStatusReason(), backend: getStockCountBackend() });
});

router.post("/api/stock-count/reload", async (_req, res) => {
  const ok = await reloadStockCountModel();
  res.json({ ready: ok, reason: getLoadStatusReason() });
});

// server/models 폴더의 사용 가능한 모델 목록 + 현재 로드된 모델
router.get("/api/stock-count/models", async (_req, res) => {
  const models = listAvailableModels();
  const current = await getCurrentYoloModel();
  res.json({ models, current });
});

router.post("/api/stock-count", async (req, res) => {
  if (!isStockCountModelLoaded()) {
    return res.status(503).json({ error: getLoadStatusReason() || "모델 미로드" });
  }
  const { image, model } = req.body ?? {};
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "image(base64) 필드 필요" });
  }
  // data URI prefix 제거
  const b64 = image.replace(/^data:image\/[a-z]+;base64,/, "");
  try {
    const result = await countObjectsInImage(b64, typeof model === "string" ? model : undefined);
    return res.json(result);
  } catch (e: any) {
    console.error("[stock-count] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
