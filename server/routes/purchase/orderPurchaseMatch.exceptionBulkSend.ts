// server/routes/purchase/orderPurchaseMatch.exceptionBulkSend.ts
// 2026-09-27 · 사용자 지시 · 발주이상 요청서 발송 handler
//   · POST /api/order-purchase-match/exception-requests/bulk-send
//   · 이상 라인들 · 공급사별 그룹핑 · 담당자에게 이메일·SMS·카톡 통지
//   · exception_dispatches 테이블 X · outcomes 로만 응답 (DB 마이그레이션 없이)
//
// 대원칙:
//   · asyncHandler + HttpError + Zod validate (route 단)
//   · Cache-Control: no-store · 발주 대원칙
//   · try/catch + prefix 로그
//   · 이메일 템플릿 · orderPurchaseMatch.exceptionEmailTemplate.ts 분리 (large-file 회피)

import type { Request, Response } from "express";
import { supabase } from "../../../src/supabase/client";
import { getSession } from "../../middleware/requireAuth";
import { notificationsService } from "../../services/notificationsService";
import logger from "../../lib/logger";
import {
  buildExceptionLines,
  buildExceptionEmail,
  type Issuer,
  type PurchaseRowLite,
} from "./orderPurchaseMatch.exceptionEmailTemplate";

const DAY_MS = 86400 * 1000;

interface PurchaseRow extends PurchaseRowLite {
  id: number | string;
  supplier_name: string | null;
  supplier_code: string | null;
  product_code: string | null;
  product_name: string | null;
  unit_price: number;
}

async function resolveIssuer(req: Request): Promise<Issuer> {
  const session = getSession(req);
  const issuer: Issuer = { name: "약국", contactName: "", orgPhone: "", personPhone: "" };
  try {
    const { data: ciRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "company_info")
      .maybeSingle();
    const ci = ciRow?.value as { name?: unknown; phone?: unknown } | null;
    if (ci && typeof ci === "object") {
      issuer.name = String(ci.name ?? "약국").trim() || "약국";
      issuer.orgPhone = String(ci.phone ?? "").trim();
    }
  } catch { /* silent · fallback */ }
  if (session) {
    issuer.contactName = String(session.name ?? "").trim();
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("phone")
        .eq("id", session.sub)
        .maybeSingle();
      issuer.personPhone = String(emp?.phone ?? "").trim();
    } catch { /* silent */ }
  }
  return issuer;
}

async function fetchPurchases(
  productCodes: string[],
  sentAtsMs: number[],
): Promise<Map<string, PurchaseRow[]>> {
  const result = new Map<string, PurchaseRow[]>();
  if (productCodes.length === 0 || sentAtsMs.length === 0) return result;
  const minSent = Math.min(...sentAtsMs);
  const maxSent = Math.max(...sentAtsMs);
  const fromDate = new Date(minSent - DAY_MS).toISOString().slice(0, 10);
  const toDate = new Date(maxSent + 14 * DAY_MS).toISOString().slice(0, 10);
  const { data: pdRows } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, supplier_name, product_code, product_name, quantity, unit_price, amount")
    .in("product_code", productCodes)
    .gte("purchase_date", fromDate)
    .lte("purchase_date", toDate);
  for (const raw of pdRows ?? []) {
    const p = raw as Record<string, unknown>;
    const code = String(p.product_code ?? "");
    if (!code) continue;
    const arr = result.get(code) ?? [];
    arr.push({
      id: p.id as number | string,
      purchase_date: (p.purchase_date as string | null) ?? null,
      supplier_name: (p.supplier_name as string | null) ?? null,
      supplier_code: null,
      product_code: code,
      product_name: (p.product_name as string | null) ?? null,
      quantity: Number(p.quantity ?? 0),
      unit_price: Number(p.unit_price ?? 0),
      amount: Number(p.amount ?? 0),
    });
    result.set(code, arr);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 채널별 발송 (email · sms · kakao) · outcomes 반환
// ═══════════════════════════════════════════════════════════════
async function dispatchChannels(
  channels: { email?: boolean; sms?: boolean; kakao?: boolean },
  targetEmail: string | null,
  targetPhone: string | null,
  supName: string,
  emailPayload: { subject: string; html: string } | null,
): Promise<string[]> {
  const outcomes: string[] = [];
  if (channels.email) {
    if (!targetEmail) outcomes.push("email:no_recipient");
    else if (!process.env.SMTP_HOST) outcomes.push("email:no_smtp_env");
    else if (!emailPayload) outcomes.push("email:no_payload");
    else {
      try {
        const nodemailerMod = await import("nodemailer");
        const nodemailer = (nodemailerMod as unknown as { default?: unknown }).default ?? nodemailerMod;
        const port = Number(process.env.SMTP_PORT ?? 587);
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure: port === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
            : undefined,
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
          to: targetEmail,
          subject: emailPayload.subject,
          html: emailPayload.html,
          textEncoding: "base64",
        });
        outcomes.push("email:sent");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`[exception-bulk-send] email 발송 실패 (${supName}): ${msg}`);
        outcomes.push(`email:error(${msg})`);
      }
    }
  }
  if (channels.sms) {
    if (!targetPhone) outcomes.push("sms:no_recipient");
    else if (!process.env.SMS_API_KEY) outcomes.push("sms:no_gateway_env");
    else outcomes.push("sms:skipped(gateway-not-installed)");
  }
  if (channels.kakao) {
    if (!targetPhone) outcomes.push("kakao:no_recipient");
    else {
      try {
        const { getSolApiStatus } = await import("../../lib/notification/solapiClient.js");
        const solStatus = getSolApiStatus();
        if (!solStatus.configured) outcomes.push(`kakao:no_env(${solStatus.missing.join(",")})`);
        else if (!process.env.SOLAPI_KAKAO_TEMPLATE_ORDER) outcomes.push("kakao:no_template");
        else outcomes.push("kakao:skipped(template-not-verified)");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        outcomes.push(`kakao:error(${msg})`);
      }
    }
  }
  return outcomes;
}

// ═══════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════
export async function handleExceptionBulkSend(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { channels, memo, bySupplier } = req.body as {
    channels: { email?: boolean; sms?: boolean; kakao?: boolean };
    memo?: string | null;
    bySupplier: Array<{
      supplier: string;
      supplier_contact?: string | null;
      supplier_email?: string | null;
      supplier_phone?: string | null;
      order_ids: Array<string | number>;
    }>;
  };

  const issuer = await resolveIssuer(req);

  const results: Array<{
    supplier: string;
    order_ids: Array<string | number>;
    target: { email: string | null; phone: string | null; contact: string | null };
    outcomes: string[];
    item_count: number;
  }> = [];

  for (const group of bySupplier) {
    const supName = String(group.supplier ?? "").trim();
    const orderIds = (group.order_ids ?? []).map((v) => String(v)).filter(Boolean);

    if (orderIds.length === 0) {
      results.push({
        supplier: supName, order_ids: [],
        target: { email: null, phone: null, contact: null },
        outcomes: ["skip:no_orders"], item_count: 0,
      });
      continue;
    }

    const { data: orderData, error: orderErr } = await supabase
      .from("order_requests")
      .select(
        "id, order_number, order_date, sent_at, supplier, product_code, product_name, order_qty, unit_price, match_status, exception_type, exception_note",
      )
      .in("id", orderIds);
    if (orderErr) {
      logger.warn(`[exception-bulk-send] order_requests 조회 실패 (${supName}): ${orderErr.message}`);
      results.push({
        supplier: supName, order_ids: orderIds,
        target: { email: null, phone: null, contact: null },
        outcomes: [`fetch:error(${orderErr.message})`], item_count: 0,
      });
      continue;
    }
    const orders = orderData ?? [];
    if (orders.length === 0) {
      results.push({
        supplier: supName, order_ids: orderIds,
        target: { email: null, phone: null, contact: null },
        outcomes: ["fetch:no_rows"], item_count: 0,
      });
      continue;
    }

    type OrderRecord = Record<string, unknown>;
    const orderRecords = orders as OrderRecord[];
    const productCodes: string[] = Array.from(
      new Set(orderRecords.map((o) => String(o.product_code ?? "")).filter((s: string) => Boolean(s))),
    );
    const sentAtsMs = orderRecords
      .map((o) => (o.sent_at ? new Date(String(o.sent_at)).getTime() : null))
      .filter((v): v is number => v != null && Number.isFinite(v));
    const purchasesByCode = await fetchPurchases(productCodes, sentAtsMs);

    let vendor: { email?: string | null; phone?: string | null; contact_name?: string | null } | null = null;
    if (supName) {
      const { data } = await supabase
        .from("vendors")
        .select("id, company_name, contact_name, phone, email")
        .eq("company_name", supName)
        .maybeSingle();
      vendor = (data as typeof vendor) ?? null;
    }
    const targetEmail = group.supplier_email ?? vendor?.email ?? null;
    const targetPhone = group.supplier_phone ?? vendor?.phone ?? null;
    const targetName  = group.supplier_contact ?? vendor?.contact_name ?? null;

    const exceptionLines = buildExceptionLines(orders, purchasesByCode);
    const emailPayload = channels.email
      ? buildExceptionEmail(supName, targetName, memo, exceptionLines, issuer)
      : null;

    const outcomes = await dispatchChannels(channels, targetEmail, targetPhone, supName, emailPayload);

    logger.info(
      `[exception-bulk-send] ${supName} · ${exceptionLines.length}건 · ${outcomes.join(", ")}`,
    );

    results.push({
      supplier: supName,
      order_ids: orderIds,
      target: { email: targetEmail, phone: targetPhone, contact: targetName },
      outcomes,
      item_count: exceptionLines.length,
    });
  }

  const anyRealSent = results.some((r) => r.outcomes.some((o) => /:sent(\s|$)/.test(o)));
  const totalSuppliers = results.length;
  const totalItems = results.reduce((s, r) => s + r.item_count, 0);
  if (anyRealSent) {
    notificationsService.notifyAllAdmins({
      title: "발주이상 요청서 발송",
      body: `${totalSuppliers}개 공급사 · ${totalItems}건 이상 요청 발송됨`,
      type: "alert",
      push: { url: "/", tag: `exception-req-${Date.now()}` },
    }).catch(() => null);
  }

  res.json({
    ok: true,
    summary: `${totalSuppliers}개 공급사 · ${totalItems}건 이상 요청서 발송 처리`,
    channels,
    results,
  });
}
