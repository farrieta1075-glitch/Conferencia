import { AREA_LABELS, NO_PHONE } from "./constants";
import { formatDate } from "./format";
import { remainingBalance } from "./purchases";
import type { NotifyKind, Purchase, SeatRef } from "./types";

export const NOTIFY_KINDS: { id: NotifyKind; label: string }[] = [
  { id: "payment-reminder", label: "Recordatorio (próximo pago)" },
  { id: "purchase-thanks", label: "Agradecimiento de compra" },
  { id: "event-details", label: "Recordatorio fecha y detalles del evento" },
  { id: "last-details", label: "Últimos detalles (días previos al evento)" },
  { id: "post-event", label: "Agradecimiento Post-Evento" },
];

export interface NotifyVars {
  nombre: string;
  seccion: string;
  zona: string;
  asientos: string;
  n: string;
  fechaParcialidad: string;
  compraOPago: string;
}

export function daysUntilEvent(iso: string): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(iso);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

export function firstNameFrom(value: string): string {
  const token = value.trim().split(/\s+/)[0] ?? "";
  return token || "amigo(a)";
}

export function notifyVarsFor(
  purchase: Purchase,
  seatIndex: Map<string, SeatRef>,
  eventDatetime: string,
  installmentDate?: string,
): NotifyVars {
  const areas = new Set<string>();
  const zones = new Set<string>();
  const asientos: string[] = [];
  for (const ticket of purchase.tickets) {
    const seat = seatIndex.get(ticket.seatId);
    if (seat) {
      areas.add(AREA_LABELS[seat.areaId] ?? seat.areaName);
      zones.add(seat.sectionId);
      asientos.push(`${seat.rowId}${seat.number}`);
    } else {
      const [sectionId, rowId, number] = ticket.seatId.split("|");
      if (sectionId) zones.add(sectionId);
      if (rowId) asientos.push(`${rowId}${number ?? ""}`);
    }
  }
  const holder = purchase.tickets.find((ticket) => ticket.holderName.trim())?.holderName ?? "";
  return {
    nombre: firstNameFrom(holder),
    seccion: [...areas].join(", ") || "tu zona",
    zona: [...zones].join(", ") || "—",
    asientos: asientos.join(", ") || "—",
    n: String(daysUntilEvent(eventDatetime)),
    fechaParcialidad: installmentDate ? formatDate(installmentDate) : "tu próxima fecha",
    compraOPago: remainingBalance(purchase) <= 0.009 ? "compra" : "pago exitoso",
  };
}

export function fillNotifyTemplate(kind: NotifyKind, vars: NotifyVars): string {
  const map: Record<string, string> = {
    Nombre: vars.nombre,
    Sección: vars.seccion,
    Seccion: vars.seccion,
    Zona: vars.zona,
    Asientos: vars.asientos,
    N: vars.n,
    "fecha de parcialidad": vars.fechaParcialidad,
    "compra / pago exitoso": vars.compraOPago,
  };
  return templateFor(kind).replace(/\[([^\]]+)\]/g, (full, key: string) => map[key] ?? full);
}

function templateFor(kind: NotifyKind): string {
  switch (kind) {
    case "payment-reminder":
      return `¡Hola, [Nombre]! 👋 Dios te bendiga. Te saludamos con mucho gusto de parte del equipo de Conferencia 2027 de Mas Vida.

Queremos recordarte con todo cariño que la fecha sugerida para tu siguiente aportación en parcialidades fue programada para [fecha de parcialidad]. Te recordamos que este esquema es solo un apoyo flexible para facilitarte tus pagos —sin presiones ni carácter obligatorio—, pero de gran ayuda para ir avanzando con tu compra.

Te esperamos en el módulo de Conferencia 2027 que está a la salida del campus para realizar tu pago en la terminal bancaria. ¡Gracias por tu compromiso y que Dios bendiga tu generosidad! 🙏✨`;
    case "purchase-thanks":
      return `¡Hola, [Nombre]! ¡Bendiciones en este día! 🙏 Nos llena de mucha alegría confirmar tu [compra / pago exitoso] para Conferencia 2027.

🎟️ Tus lugares asignados son:
• Sección: [Sección]
• Zona: [Zona]
• Asientos: [Asientos]

Este encuentro será un tiempo precioso de renovación, fe y crecimiento espiritual para tu vida. Te esperamos con los brazos abiertos en el Auditorio Nacional el 15 y 16 de marzo de 2027. ¡Oramos porque Dios prepare tu corazón para todo lo hermoso que tiene preparado! 🙌✨`;
    case "event-details":
      return `¡Hola, [Nombre]! Dios te bendiga grandemente. 🕊️ Queremos recordarte que cada vez falta menos para vivir juntos Conferencia 2027, el próximo 15 y 16 de marzo de 2027 en el Auditorio Nacional. Tus lugares en la zona [Zona] están listos y guardados con mucha ilusión.

Además, te compartimos una gran noticia: hemos confirmado a nuevos invitados musicales y se suman nuevos talleres.

Prepárate en oración, porque Dios quiere hacer cosas maravillosas en medio de nosotros. ¡Nos vemos muy pronto! 🙌`;
    case "last-details":
      return `¡Hola, [Nombre]! ¡Faltan solo [N] días para Conferencia 2027! 🎉 Oramos para que este tiempo sea de profunda bendición para ti y los tuyos.

Para que tu llegada sea muy cómoda, te compartimos algunos detalles importantes:
🕒 Horario: Te sugerimos llegar con tiempo suficiente para hacer tu Check-In que iniciará a las 13hrs del 15 de marzo y así tomar tu lugar con calma.
🚫 Ingreso: Te recordamos que no está permitido introducir alimentos ni bebidas al recinto.
🅿️ Estacionamiento/Comida: Hay estacionamientos cercanos al Auditorio Nacional y zonas de alimentos en los alrededores.

¡Que Dios bendiga tus pasos y nos vemos para adorar y aprender juntos! 🙏✨`;
    case "post-event":
      return `¡Hola, [Nombre]! Dios te bendiga. Queremos agradecerte de corazón por habernos acompañado en Conferencia 2027.

Oramos firmemente para que todo lo que sembraste, aprendiste y viviste en el Auditorio Nacional dé frutos abundantes en tu vida y en tu familia. ¡Gracias por formar parte de este tiempo especial! Nos vemos el próximo año con la ayuda de Dios. 🙏🙌`;
  }
}

export function canNotifyPhone(phone: string): boolean {
  const trimmed = phone.trim().toLowerCase();
  if (!trimmed || trimmed === NO_PHONE) return false;
  return phone.replace(/\D/g, "").length >= 10;
}
