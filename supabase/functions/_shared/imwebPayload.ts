type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function pickOrderFields(source: JsonObject): JsonObject {
  const orderer = asObject(source.orderer);
  return {
    ...source,
    orderNo: source.orderNo ?? source.order_no ?? source.channelOrderNo,
    ordererEmail:
      source.ordererEmail ??
      source.orderer_email ??
      orderer?.email ??
      orderer?.ordererEmail,
    siteCode: source.siteCode ?? source.site_code,
    totalPaymentPrice:
      source.totalPaymentPrice ??
      source.total_payment_price ??
      source.totalPrice ??
      source.total_price,
    sections: source.sections,
    payments: source.payments ?? source.payment,
    event_type: source.event_type ?? source.eventType,
  };
}

function hasOrderShape(obj: JsonObject): boolean {
  return (
    obj.orderNo != null ||
    obj.order_no != null ||
    obj.ordererEmail != null ||
    obj.orderer_email != null ||
    Array.isArray(obj.sections)
  );
}

export function normalizeImwebOrderPayload(body: JsonObject): JsonObject {
  if (hasOrderShape(body)) {
    return pickOrderFields(body);
  }

  for (const key of ["data", "order", "payload", "body", "orderData"]) {
    const nested = asObject(body[key]);
    if (nested && hasOrderShape(nested)) {
      return pickOrderFields({ ...body, ...nested });
    }
  }

  const rawData = body.data;
  if (typeof rawData === "string" && rawData.trim()) {
    try {
      const parsed = JSON.parse(rawData) as unknown;
      const nested = asObject(parsed);
      if (nested) return normalizeImwebOrderPayload({ ...body, ...nested });
    } catch (_) {
      // ignore
    }
  }

  return pickOrderFields(body);
}
