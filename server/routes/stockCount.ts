import { Router } from "express";
import { countObjectsInImage, isStockCountModelLoaded, reloadStockCountModel } from "../stockCounter";

const router = Router();

router.get("/api/stock-count/status", (_req, res) => {
  res.json({ ready: isStockCountModelLoaded() });
});

router.post("/api/stock-count/reload", async (_req, res) => {
  const ok = await reloadStockCountModel();
  res.json({ ready: ok });
});

router.post("/api/stock-count", async (req, res) => {
  if (!isStockCountModelLoaded()) {
    return res.status(503).json({ error: "모델 미로드 — server/models/best.onnx를 추가 후 서버를 재시작하세요" });
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
