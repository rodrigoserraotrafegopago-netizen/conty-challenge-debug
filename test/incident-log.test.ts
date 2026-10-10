import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDatabase } from "../src/db.ts";
import { normalizeKey } from "../src/idempotency.ts";
import { seedIncident } from "../src/seed.ts";

// Casos que aparecem em logs/incident.jsonl e não estão nomeados em payouts.test.ts.

type App = ReturnType<typeof createApp>;

function setup(): App {
  const db = openDatabase(":memory:");
  seedIncident(db);
  return createApp(db);
}

async function postJson(app: App, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ledgerOf(app: App, missionId: string) {
  const res = await app.request(`/missions/${missionId}`);
  return ((await res.json()) as { ledger: Array<{ amount_brl: number }> }).ledger;
}

describe("casos do log do incidente", () => {
  let app: App;

  beforeEach(() => {
    app = setup();
  });

  it("normaliza a chave: espaço nas pontas e caractere invisível não criam chave nova", () => {
    expect(normalizeKey("pay_22a ")).toBe("pay_22a");
    expect(normalizeKey("pay_7c1\u200b")).toBe("pay_7c1");
    expect(normalizeKey("\ufeffpay_9f3")).toBe("pay_9f3");
  });

  it("não credita de novo quando o retry chega com zero-width space na chave (msn_2044, linha 13)", async () => {
    const payload = { mission_id: "msn_2044", approved_at: "2026-03-12T21:05:00.000Z" };
    expect((await postJson(app, "/approvals", { ...payload, idempotency_key: "pay_7c1" })).status).toBe(201);
    expect((await postJson(app, "/approvals", { ...payload, idempotency_key: "pay_7c1\u200b" })).status).toBe(200);
    expect(await ledgerOf(app, "msn_2044")).toHaveLength(1);
  });

  it("grava R$ 80,00 para a missão de 8000 centavos (msn_2044, linha 12)", async () => {
    const res = await postJson(app, "/approvals", {
      mission_id: "msn_2044",
      approved_at: "2026-03-12T21:05:00.000Z",
      idempotency_key: "pay_7c1",
    });
    expect(((await res.json()) as { ledger: { amount_brl: number } }).ledger.amount_brl).toBe(80);
  });

  it("não credita a mesma missão duas vezes, mesmo que a chave do retry venha diferente", async () => {
    const payload = { mission_id: "msn_1900", approved_at: "2026-03-12T18:11:00.000Z" };
    expect((await postJson(app, "/approvals", { ...payload, idempotency_key: "pay_22a" })).status).toBe(201);
    expect((await postJson(app, "/approvals", { ...payload, idempotency_key: "pay_22a-retry" })).status).toBe(200);
    expect(await ledgerOf(app, "msn_1900")).toHaveLength(1);
  });

  it("aceita aprovação às 23:59:59.999 de São Paulo no dia do prazo", async () => {
    const res = await postJson(app, "/approvals", {
      mission_id: "msn_1842",
      approved_at: "2026-03-13T02:59:59.999Z",
      idempotency_key: "pay_last_instant",
    });
    expect(res.status).toBe(201);
  });

  it("data sem fuso explícito é lida como dia de São Paulo", async () => {
    const late = await postJson(app, "/approvals", { mission_id: "msn_1842", approved_at: "2026-03-13", idempotency_key: "pay_d1" });
    expect(late.status).toBe(409);
    const onTime = await postJson(app, "/approvals", { mission_id: "msn_1842", approved_at: "2026-03-12T23:30:00", idempotency_key: "pay_d2" });
    expect(onTime.status).toBe(201);
  });

  it("recusa chave que fica vazia depois de limpar espaços e caracteres invisíveis", async () => {
    const res = await postJson(app, "/approvals", { mission_id: "msn_1900", approved_at: "2026-03-12T18:11:00.000Z", idempotency_key: " \u200b " });
    expect(res.status).toBe(400);
    expect(await ledgerOf(app, "msn_1900")).toHaveLength(0);
  });

  it("recusa aprovação às 00:00 de São Paulo do dia seguinte ao prazo", async () => {
    const res = await postJson(app, "/approvals", {
      mission_id: "msn_1842",
      approved_at: "2026-03-13T03:00:00.000Z",
      idempotency_key: "pay_first_instant",
    });
    expect(res.status).toBe(409);
    expect(await ledgerOf(app, "msn_1842")).toHaveLength(0);
  });
});
