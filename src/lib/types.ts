export type AreaId =
  | "preferente"
  | "luneta"
  | "balcon"
  | "primer-piso"
  | "segundo-piso";

export type SeatStatus = "unassigned" | "available" | "held" | "sold" | "foreign";
export type DiscountType = "fixed" | "percent";
export type PaymentMode = "total" | "partial";
export type PaymentMethod = "card" | "cash";
export type InstallmentCount = 3 | 4 | 5 | 6;

export interface RowSpec {
  id: string;
  order?: number;
  seats: number[];
  slots?: SeatSlot[];
  accessibleSeats?: number[];
}

export type SeatSlot =
  | { kind: "seat"; number: number }
  | { kind: "aisle"; id: "P1" | "P2" }
  | { kind: "clear" }
  | { kind: "empty" };

export interface SectionSpec {
  id: string;
  name: string;
  rows: RowSpec[];
}

export interface AreaSpec {
  id: AreaId;
  name: string;
  colorLabel: string;
  sections: SectionSpec[];
}

export interface VenueTabulador {
  venueName: string;
  venueCity: string;
  officialCapacity: number;
  notes?: string;
  areas: AreaSpec[];
  version: string;
}

export interface SeatRef {
  id: string;
  areaId: AreaId;
  areaName: string;
  sectionId: string;
  sectionName: string;
  rowId: string;
  number: number;
  accessible?: boolean;
}

export interface EventConfig {
  name: string;
  datetime: string;
  logoDataUrl?: string;
}

export interface AreaPrice {
  areaId: AreaId;
  basePrice: number;
}

export interface Promotion {
  id: string;
  name: string;
  zoneIds: AreaId[];
  discountType: DiscountType;
  discountValue: number;
  expiresAt: string;
}

export interface Installment {
  index: number;
  date: string;
  amount: number;
  paid: boolean;
  originalAmount?: number;
}

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  cancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
}

export interface ReminderJob {
  id: string;
  channel: "whatsapp" | "email";
  to: string;
  scheduledFor: string;
  message: string;
  status: "simulated";
}

export interface Ticket {
  id: string;
  seatId: string;
  holderName: string;
  price: number;
  basePrice: number;
  promotionName?: string;
  promotionId?: string;
}

export interface Purchase {
  id: string;
  createdAt: string;
  campus?: string;
  customer: {
    phone: string;
    email: string;
  };
  paymentMode: PaymentMode;
  paymentMethod: PaymentMethod;
  tickets: Ticket[];
  deposit: number;
  total: number;
  paid: number;
  cancelled?: boolean;
  selectedPlan?: InstallmentCount;
  installments: Installment[];
  payments?: PaymentRecord[];
  reminders: ReminderJob[];
}

export interface PersistedState {
  event: EventConfig;
  tabulador: VenueTabulador;
  seatStatus: Record<string, SeatStatus>;
  foreignSeats?: string[];
  prices: AreaPrice[];
  promotions: Promotion[];
  purchases: Purchase[];
}

export interface AssignPayload {
  seatIds: string[];
  status: Extract<SeatStatus, "unassigned" | "available">;
}

export interface SectionGeometry {
  sectionId: string;
  areaId: AreaId;
  thetaStart: number;
  thetaEnd: number;
  rInner: number;
  rOuter: number;
}

export interface PolarPoint {
  x: number;
  y: number;
  theta: number;
  r: number;
}

export interface InstallmentPlan {
  n: InstallmentCount;
  deposit: number;
  remaining: number;
  payments: { date: string; amount: number }[];
  total: number;
}
