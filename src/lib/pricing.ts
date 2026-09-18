import type { AreaId, Promotion, SeatRef } from "./types";
import { roundMoney } from "./format";

export function activePromotion(
  promotions: Promotion[],
  areaId: AreaId,
  at = new Date(),
): Promotion | undefined {
  return promotions
    .filter((promo) => promo.zoneIds.includes(areaId) && new Date(promo.expiresAt) >= at)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
}

export function applyDiscount(basePrice: number, promotion?: Promotion): number {
  if (!promotion) return roundMoney(basePrice);
  if (promotion.discountType === "percent") {
    return roundMoney(Math.max(0, basePrice * (1 - promotion.discountValue / 100)));
  }
  return roundMoney(Math.max(0, basePrice - promotion.discountValue));
}

export function priceForSeat(
  seat: SeatRef,
  prices: { areaId: AreaId; basePrice: number }[],
  promotions: Promotion[],
  at = new Date(),
): { basePrice: number; price: number; promotion?: Promotion } {
  const basePrice = prices.find((item) => item.areaId === seat.areaId)?.basePrice ?? 0;
  const promotion = activePromotion(promotions, seat.areaId, at);
  return {
    basePrice,
    price: applyDiscount(basePrice, promotion),
    promotion,
  };
}
