"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api/client";
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

async function syncSheets(state: PersistedState) {
  try {
    await apiFetch("/api/sheets", {
      method: "POST",
      body: JSON.stringify({ state }),
    });
  } catch {
    // VIEWER no tiene sheets:sync; si falta el ID de la hoja, tampoco bloqueamos la venta.
  }
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
  statusOf: (id: string) => SeatStatus;
}

const StoreContext = createContext<StoreValue | null>(null);

export function EventStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createDefaultState);
  const [hydrated, setHydrated] = useReducer((_: boolean, value: boolean) => value, false);

  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed?.tabulador?.areas?.length) {
          dispatch({ type: "hydrate", state: parsed });
        }
      }
    } catch (error) {
      console.warn("No se pudo leer localStorage", error);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("No se pudo guardar localStorage", error);
    }
  }, [state, hydrated]);

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
        await apiFetch("/api/event", { method: "PATCH", body: JSON.stringify(event) });
        dispatch({ type: "setEvent", event });
        void syncSheets({ ...state, event });
      },
      importTabulador: async (tabulador, resetAssignments) => {
        await apiFetch("/api/import", { method: "POST", body: JSON.stringify({ tabulador }) });
        dispatch({ type: "setTabulador", tabulador, resetAssignments });
      },
      assignSeats: async (payload) => {
        await apiFetch("/api/seats", { method: "PATCH", body: JSON.stringify(payload) });
        dispatch({ type: "assignSeats", payload });
      },
      setPrice: async (areaId, basePrice) => {
        await apiFetch("/api/prices", {
          method: "PATCH",
          body: JSON.stringify({ areaId, basePrice }),
        });
        dispatch({ type: "setPrice", areaId, basePrice });
      },
      upsertPromotion: async (promotion) => {
        await apiFetch("/api/promotions", { method: "POST", body: JSON.stringify(promotion) });
        dispatch({ type: "upsertPromotion", promotion });
      },
      removePromotion: async (id) => {
        await apiFetch(`/api/promotions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        dispatch({ type: "removePromotion", id });
      },
      buy: async (payload) => {
        const purchase = await buildPurchase(state, payload);
        await apiFetch("/api/purchases", { method: "POST", body: JSON.stringify(purchase) });
        dispatch({ type: "buy", purchase });
        void syncSheets({
          ...applySeatStatuses({ ...state, purchases: [purchase, ...state.purchases] }, purchase),
        });
        return purchase;
      },
      updatePurchase: async (id, patch) => {
        await apiFetch(`/api/purchases/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        dispatch({ type: "updatePurchase", id, patch });
      },
      applyPayment: async (id, amount, settleAll) => {
        await apiFetch(`/api/purchases/${encodeURIComponent(id)}/pay`, {
          method: "POST",
          body: JSON.stringify({ amount, settleAll }),
        });
        dispatch({ type: "applyPayment", id, amount, settleAll });
      },
      resetVenue: async () => {
        await apiFetch("/api/venues", { method: "DELETE" });
        dispatch({ type: "resetVenue" });
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
