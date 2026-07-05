import { Router } from "express";
import { countObjectsInImage, isStockCountModelLoaded, reloadStockCountModel, getLoadStatusReason } from "../stockCounter";

const router = Router();

router.get("/api/stock-count/status", (_req, res) => {
  const ready = isStockCountModelLoaded();
  res.json({ ready, reason: getLoadStatusReason() });
});

router.post("/api/stock-count/reload", async (_req, res) => {
  const ok = await reloadStockCountModel();
  res.json({ ready: ok, reason: getLoadStatusReason() });
});

router.post("/api/stock-count", async (req, res) => {
  if (!isStockCountModelLoaded()) {
    return res.status(503).json({ error: getLoadStatusReason() || "모델 미로드" });
  }
  const { image } = req.body ?? {};
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "image(base64) 필드 필요" });
  }
  // data URI prefix 제거
  const b64 = image.replace(/^data:image\/[a-z]+;base64,/, "");
  try {
    const result = await countObjectsInImage(b64);
    return res.json(result);
  } catch (e: any) {
    console.error("[stock-count] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
