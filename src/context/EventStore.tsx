"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api/client";
import { hasPermission } from "@/lib/auth/roles";
import { AREA_ORDER, DEFAULT_PRICES, STORAGE_KEY } from "@/lib/constants";
import { seatId } from "@/lib/format";
import { buildInstallmentPlans } from "@/lib/installments";
import { notificationHooks } from "@/lib/notifications";
import { priceForSeat } from "@/lib/pricing";
import {
  applyPurchasePatch,
  applyPurchasePayment,
  purchaseSeatStatus,
  type PurchasePatch,
} from "@/lib/purchases";
import {
  buildDefaultTabulador,
  countTabuladorSeats,
  flattenSeats,
  indexSeats,
} from "@/lib/tabulador/generator";
import { rehomeSectionsByNumber } from "@/lib/tabulador/xlsx";
import type {
  AreaId,
  AssignPayload,
  EventConfig,
  InstallmentCount,
  PersistedState,
  Promotion,
  Purchase,
  SeatStatus,
  VenueTabulador,
} from "@/lib/types";

export type { AssignPayload };

export interface BuyPayload {
  seatIds: string[];
  holderNames: string[];
  phone: string;
  email: string;
  paymentMode: Purchase["paymentMode"];
  paymentMethod: Purchase["paymentMethod"];
  deposit: number;
  selectedPlan?: InstallmentCount;
  remindWhatsApp: boolean;
  remindEmail: boolean;
}

type Action =
  | { type: "hydrate"; state: PersistedState }
  | { type: "setEvent"; event: EventConfig }
  | { type: "setTabulador"; tabulador: VenueTabulador; resetAssignments?: boolean }
  | { type: "assignSeats"; payload: AssignPayload }
  | { type: "setPrice"; areaId: AreaId; basePrice: number }
  | { type: "upsertPromotion"; promotion: Promotion }
  | { type: "removePromotion"; id: string }
  | { type: "buy"; purchase: Purchase }
  | { type: "updatePurchase"; id: string; patch: PurchasePatch }
  | { type: "applyPayment"; id: string; amount: number; settleAll?: boolean }
  | { type: "resetVenue" };

const defaultTabulador = buildDefaultTabulador();

function seedSeatStatus(tabulador: VenueTabulador): Record<string, SeatStatus> {
  const status: Record<string, SeatStatus> = {};
  for (const area of tabulador.areas) {
    if (area.id !== "preferente" && area.id !== "luneta") continue;
    for (const section of area.sections) {
      for (const row of section.rows) {
        for (const number of row.seats) {
          status[seatId(section.id, row.id, number)] = "available";
        }
      }
    }
  }
  return status;
}

function createDefaultState(): PersistedState {
  return {
    event: {
      name: "Conferencia Magistral 2026",
      datetime: "2026-12-15T20:00:00",
    },
    tabulador: defaultTabulador,
    seatStatus: seedSeatStatus(defaultTabulador),
    prices: AREA_ORDER.map((areaId) => ({
      areaId,
      basePrice: DEFAULT_PRICES[areaId],
    })),
    promotions: [],
    purchases: [],
  };
}

function pruneStatus(
  seatStatus: Record<string, SeatStatus>,
  tabulador: VenueTabulador,
): Record<string, SeatStatus> {
  const valid = new Set(flattenSeats(tabulador).map((seat) => seat.id));
  return Object.fromEntries(
    Object.entries(seatStatus).filter(([id]) => valid.has(id)),
  );
}

function applySeatStatuses(state: PersistedState, purchase: Purchase): PersistedState {
  const seatStatus = { ...state.seatStatus };
  const nextStatus = purchaseSeatStatus(purchase);
  for (const ticket of purchase.tickets) {
    seatStatus[ticket.seatId] = nextStatus;
  }
  return { ...state, seatStatus };
}

export async function buildPurchase(
  state: PersistedState,
  payload: BuyPayload,
): Promise<Purchase> {
  const catalog = indexSeats(state.tabulador);
  const tickets = payload.seatIds.map((id, index) => {
    const seat = catalog.get(id);
    if (!seat) throw new Error(`Asiento inexistente ${id}`);
    const priced = priceForSeat(seat, state.prices, state.promotions);
    return {
      id: `tkt-${Date.now()}-${index}`,
      seatId: id,
      holderName: payload.holderNames[index] ?? payload.holderNames[0] ?? "",
      price: priced.price,
      basePrice: priced.basePrice,
      promotionName: priced.promotion?.name,
      promotionId: priced.promotion?.id,
    };
  });

  const total = tickets.reduce((sum, ticket) => sum + ticket.price, 0);
  const isPartial = payload.paymentMode === "partial";
  const deposit = isPartial ? Math.min(payload.deposit, total) : total;

  const purchase: Purchase = {
    id: `buy-${Date.now()}`,
    createdAt: new Date().toISOString(),
    customer: { phone: payload.phone, email: payload.email },
    paymentMode: payload.paymentMode,
    paymentMethod: payload.paymentMethod,
    tickets,
    deposit,
    total,
    paid: deposit,
    selectedPlan: payload.selectedPlan,
    installments: [],
    reminders: [],
  };

  if (isPartial && payload.selectedPlan) {
    const plan = buildInstallmentPlans(total, deposit, state.event.datetime).find(
      (item) => item.n === payload.selectedPlan,
    );
    if (plan) {
      purchase.installments = plan.payments.map((item, index) => ({
        index: index + 1,
        date: item.date,
        amount: item.amount,
        paid: index === 0,
      }));
    }
  }

  const pending = purchase.installments.filter((item) => !item.paid);
  if (payload.remindWhatsApp) {
    purchase.reminders.push(
      ...(await notificationHooks.scheduleWhatsApp(
        payload.phone,
        pending,
        state.event.name,
      )),
    );
  }
  if (payload.remindEmail) {
    purchase.reminders.push(
      ...(await notificationHooks.scheduleEmail(
        payload.email,
        pending,
        state.event.name,
      )),
    );
  }

  return purchase;
}

function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "setEvent":
      return { ...state, event: action.event };
    case "setTabulador": {
      const nextStatus = action.resetAssignments
        ? seedSeatStatus(action.tabulador)
        : pruneStatus(state.seatStatus, action.tabulador);
      return { ...state, tabulador: action.tabulador, seatStatus: nextStatus };
    }
    case "assignSeats": {
      const seatStatus = { ...state.seatStatus };
      for (const id of action.payload.seatIds) {
        const current = seatStatus[id] ?? "unassigned";
        if (current === "held" || current === "sold") continue;
        if (action.payload.status === "unassigned") delete seatStatus[id];
        else seatStatus[id] = "available";
      }
      return { ...state, seatStatus };
    }
    case "setPrice":
      return {
        ...state,
        prices: state.prices.map((item) =>
          item.areaId === action.areaId
            ? { ...item, basePrice: action.basePrice }
            : item,
        ),
      };
    case "upsertPromotion": {
      const exists = state.promotions.some((item) => item.id === action.promotion.id);
      return {
        ...state,
        promotions: exists
          ? state.promotions.map((item) =>
              item.id === action.promotion.id ? action.promotion : item,
            )
          : [...state.promotions, action.promotion],
      };
    }
    case "removePromotion":
      return {
        ...state,
        promotions: state.promotions.filter((item) => item.id !== action.id),
      };
    case "buy": {
      const withPurchase = {
        ...state,
        purchases: [action.purchase, ...state.purchases],
      };
      return applySeatStatuses(withPurchase, action.purchase);
    }
    case "updatePurchase": {
      const purchases = state.purchases.map((item) =>
        item.id === action.id ? applyPurchasePatch(item, action.patch) : item,
      );
      return { ...state, purchases };
    }
    case "applyPayment": {
      const current = state.purchases.find((item) => item.id === action.id);
      if (!current) return state;
      const updated = applyPurchasePayment(current, action.amount, action.settleAll);
      const purchases = state.purchases.map((item) => (item.id === action.id ? updated : item));
      return applySeatStatuses({ ...state, purchases }, updated);
    }
    case "resetVenue":
      return createDefaultState();
    default:
      return state;
  }
}

async function syncSheets(delta: {
  event?: PersistedState["event"];
  officialCapacity?: number;
  version?: string;
  prices?: PersistedState["prices"];
  promotions?: PersistedState["promotions"];
  purchases?: PersistedState["purchases"];
  tabulador?: VenueTabulador;
  writeTabulador?: boolean;
  seatPatch?: Record<string, SeatStatus>;
  seatStatus?: Record<string, SeatStatus>;
  forceSeatStatus?: boolean;
}) {
  try {
    await apiFetch("/api/sheets", {
      method: "POST",
      body: JSON.stringify({ delta }),
    });
  } catch {
    // VIEWER no tiene sheets:sync; si falta el ID de la hoja, tampoco bloqueamos la venta.
  }
}

interface PendingSheets {
  event: boolean;
  prices: boolean;
  promotions: boolean;
  purchases: boolean;
  tabulador: boolean;
  replaceSeatStatus: boolean;
  seatPatch: Record<string, SeatStatus>;
}

function emptyPending(): PendingSheets {
  return {
    event: false,
    prices: false,
    promotions: false,
    purchases: false,
    tabulador: false,
    replaceSeatStatus: false,
    seatPatch: {},
  };
}

let pendingSheets = emptyPending();
let syncChain = Promise.resolve();

function mergePending(update: Partial<PendingSheets>) {
  pendingSheets = {
    event: pendingSheets.event || Boolean(update.event),
    prices: pendingSheets.prices || Boolean(update.prices),
    promotions: pendingSheets.promotions || Boolean(update.promotions),
    purchases: pendingSheets.purchases || Boolean(update.purchases),
    tabulador: pendingSheets.tabulador || Boolean(update.tabulador),
    replaceSeatStatus: pendingSheets.replaceSeatStatus || Boolean(update.replaceSeatStatus),
    seatPatch: { ...pendingSheets.seatPatch, ...update.seatPatch },
  };
}

function takePending(): PendingSheets {
  const current = pendingSheets;
  pendingSheets = emptyPending();
  return current;
}

function hasPending(pending: PendingSheets) {
  return (
    pending.event ||
    pending.prices ||
    pending.promotions ||
    pending.purchases ||
    pending.tabulador ||
    pending.replaceSeatStatus ||
    Object.keys(pending.seatPatch).length > 0
  );
}

function withCanonicalAreas(state: PersistedState): PersistedState {
  if (!state.tabulador?.areas?.length) return state;
  return { ...state, tabulador: rehomeSectionsByNumber(state.tabulador) };
}

interface StoreValue {
  state: PersistedState;
  hydrated: boolean;
  seatIndex: ReturnType<typeof indexSeats>;
  tabuladorCount: number;
  availableCount: number;
  setEvent: (event: EventConfig) => Promise<void>;
  importTabulador: (tabulador: VenueTabulador, resetAssignments?: boolean) => Promise<void>;
  assignSeats: (payload: AssignPayload) => Promise<void>;
  setPrice: (areaId: AreaId, basePrice: number) => Promise<void>;
  upsertPromotion: (promotion: Promotion) => Promise<void>;
  removePromotion: (id: string) => Promise<void>;
  buy: (payload: BuyPayload) => Promise<Purchase>;
  updatePurchase: (id: string, patch: PurchasePatch) => Promise<void>;
  applyPayment: (id: string, amount: number, settleAll?: boolean) => Promise<void>;
  resetVenue: () => Promise<void>;
  reloadFromSheets: () => Promise<void>;
  statusOf: (id: string) => SeatStatus;
}

const StoreContext = createContext<StoreValue | null>(null);

export function EventStoreProvider({ children }: { children: ReactNode }) {
  const { status, data: session } = useSession();
  const [state, dispatch] = useReducer(reducer, undefined, createDefaultState);
  const [hydrated, setHydrated] = useReducer((_: boolean, value: boolean) => value, false);
  const [remoteReady, setRemoteReady] = useReducer((_: boolean, value: boolean) => value, false);
  const sheetsReady = useRef(false);
  const startedRemote = useRef(false);
  const syncTimer = useRef<number>(0);
  const stateRef = useRef(state);
  const canSyncRef = useRef(false);
  const canSync = hasPermission(session?.user?.role, "sheets:sync");
  stateRef.current = state;
  canSyncRef.current = canSync;

  function flushSheets() {
    if (!sheetsReady.current || !canSyncRef.current) return;
    const pending = takePending();
    if (!hasPending(pending)) return;
    const snapshot = stateRef.current;
    syncChain = syncChain
      .then(() =>
        syncSheets({
          event: pending.event ? snapshot.event : undefined,
          officialCapacity: pending.event ? snapshot.tabulador.officialCapacity : undefined,
          version: pending.event ? snapshot.tabulador.version : undefined,
          prices: pending.prices ? snapshot.prices : undefined,
          promotions: pending.promotions ? snapshot.promotions : undefined,
          purchases: pending.purchases ? snapshot.purchases : undefined,
          tabulador: pending.tabulador ? snapshot.tabulador : undefined,
          writeTabulador: pending.tabulador,
          seatPatch: pending.replaceSeatStatus ? undefined : pending.seatPatch,
          seatStatus: pending.replaceSeatStatus ? snapshot.seatStatus : undefined,
          forceSeatStatus: pending.replaceSeatStatus,
        }),
      )
      .catch(() => undefined);
  }

  function queueSheets(update: Partial<PendingSheets>) {
    if (!canSyncRef.current) return;
    mergePending(update);
    if (!sheetsReady.current) return;
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      flushSheets();
    }, 700);
  }

  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed?.tabulador?.areas?.length) {
          dispatch({ type: "hydrate", state: withCanonicalAreas(parsed) });
        }
      }
    } catch (error) {
      console.warn("No se pudo leer localStorage", error);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "unauthenticated") {
        startedRemote.current = false;
        sheetsReady.current = false;
        pendingSheets = emptyPending();
        setRemoteReady(true);
      }
      return;
    }
    if (startedRemote.current) return;
    startedRemote.current = true;
    let cancelled = false;

    async function hydrateFromSheets(attempt = 0): Promise<void> {
      if (cancelled) return;
      const payload = await apiFetch<{ state?: PersistedState | null; hydrateError?: string }>(
        "/api/sheets?hydrate=1",
      );
      if (cancelled) return;
      if (payload.hydrateError) {
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500 * (attempt + 1)));
          return hydrateFromSheets(attempt + 1);
        }
        throw new Error(payload.hydrateError);
      }
      const incoming = payload.state;
      if (!incoming) {
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500 * (attempt + 1)));
          return hydrateFromSheets(attempt + 1);
        }
        return;
      }
      if (cancelled) return;
      pendingSheets = emptyPending();
      sheetsReady.current = true;
      dispatch({
        type: "hydrate",
        state: withCanonicalAreas({
          ...incoming,
          tabulador: incoming.tabulador?.areas?.length
            ? incoming.tabulador
            : stateRef.current.tabulador,
        }),
      });
    }

    void hydrateFromSheets()
      .catch((error) => {
        console.warn("No se pudo leer Google Sheets", error);
      })
      .finally(() => {
        if (!cancelled) setRemoteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!hydrated) return;
    if (status === "authenticated" && !sheetsReady.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("No se pudo guardar localStorage", error);
    }
  }, [state, hydrated, remoteReady, status]);

  useEffect(() => {
    return () => window.clearTimeout(syncTimer.current);
  }, []);

  const value = useMemo<StoreValue>(() => {
    const seatIndex = indexSeats(state.tabulador);
    const availableCount = [...seatIndex.keys()].filter(
      (id) => (state.seatStatus[id] ?? "unassigned") === "available",
    ).length;

    return {
      state,
      hydrated,
      seatIndex,
      tabuladorCount: countTabuladorSeats(state.tabulador),
      availableCount,
      setEvent: async (event) => {
        dispatch({ type: "setEvent", event });
        queueSheets({ event: true });
        await apiFetch("/api/event", { method: "PATCH", body: JSON.stringify(event) });
      },
      importTabulador: async (tabulador, resetAssignments) => {
        const canonical = rehomeSectionsByNumber(tabulador);
        await apiFetch("/api/import", { method: "POST", body: JSON.stringify({ tabulador: canonical }) });
        dispatch({ type: "setTabulador", tabulador: canonical, resetAssignments });
        queueSheets({
          tabulador: true,
          event: true,
          replaceSeatStatus: Boolean(resetAssignments),
        });
      },
      assignSeats: async (payload) => {
        dispatch({ type: "assignSeats", payload });
        const seatPatch = Object.fromEntries(
          payload.seatIds.map((id) => [id, payload.status]),
        ) as Record<string, SeatStatus>;
        queueSheets({ seatPatch });
        await apiFetch("/api/seats", { method: "PATCH", body: JSON.stringify(payload) });
      },
      setPrice: async (areaId, basePrice) => {
        dispatch({ type: "setPrice", areaId, basePrice });
        queueSheets({ prices: true });
        await apiFetch("/api/prices", {
          method: "PATCH",
          body: JSON.stringify({ areaId, basePrice }),
        });
      },
      upsertPromotion: async (promotion) => {
        dispatch({ type: "upsertPromotion", promotion });
        queueSheets({ promotions: true });
        await apiFetch("/api/promotions", { method: "POST", body: JSON.stringify(promotion) });
      },
      removePromotion: async (id) => {
        dispatch({ type: "removePromotion", id });
        queueSheets({ promotions: true });
        await apiFetch(`/api/promotions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      buy: async (payload) => {
        const purchase = await buildPurchase(state, payload);
        await apiFetch("/api/purchases", { method: "POST", body: JSON.stringify(purchase) });
        dispatch({ type: "buy", purchase });
        const status = purchaseSeatStatus(purchase);
        queueSheets({
          purchases: true,
          seatPatch: Object.fromEntries(purchase.tickets.map((ticket) => [ticket.seatId, status])),
        });
        return purchase;
      },
      updatePurchase: async (id, patch) => {
        dispatch({ type: "updatePurchase", id, patch });
        queueSheets({ purchases: true });
        await apiFetch(`/api/purchases/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      },
      applyPayment: async (id, amount, settleAll) => {
        dispatch({ type: "applyPayment", id, amount, settleAll });
        const current = state.purchases.find((item) => item.id === id);
        const seatPatch: Record<string, SeatStatus> = {};
        if (current) {
          const updated = applyPurchasePayment(current, amount, settleAll);
          const status = purchaseSeatStatus(updated);
          for (const ticket of updated.tickets) seatPatch[ticket.seatId] = status;
        }
        queueSheets({ purchases: true, seatPatch });
        await apiFetch(`/api/purchases/${encodeURIComponent(id)}/pay`, {
          method: "POST",
          body: JSON.stringify({ amount, settleAll }),
        });
      },
      resetVenue: async () => {
        pendingSheets = emptyPending();
        await apiFetch("/api/venues", { method: "DELETE" });
        dispatch({ type: "resetVenue" });
      },
      reloadFromSheets: async () => {
        const payload = await apiFetch<{
          state?: PersistedState | null;
          hydrateError?: string;
          ready?: boolean;
        }>("/api/sheets?hydrate=1");
        if (payload.hydrateError) throw new Error(payload.hydrateError);
        if (!payload.state) {
          throw new Error(
            payload.ready
              ? "La hoja no tiene datos para cargar"
              : "Falta GOOGLE_SHEETS_ID o las credenciales en Vercel",
          );
        }
        pendingSheets = emptyPending();
        sheetsReady.current = true;
        dispatch({
          type: "hydrate",
          state: withCanonicalAreas({
            ...payload.state,
            tabulador: payload.state.tabulador.areas.length
              ? payload.state.tabulador
              : state.tabulador,
          }),
        });
      },
      statusOf: (id) => state.seatStatus[id] ?? "unassigned",
    };
  }, [hydrated, state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useEventStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useEventStore debe usarse dentro de EventStoreProvider");
  return ctx;
}
