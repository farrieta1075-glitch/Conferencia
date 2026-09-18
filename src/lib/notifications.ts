import type { Installment, ReminderJob } from "./types";

export interface NotificationScheduler {
  scheduleWhatsApp(to: string, installments: Installment[], eventName: string): Promise<ReminderJob[]>;
  scheduleEmail(to: string, installments: Installment[], eventName: string): Promise<ReminderJob[]>;
}

function jobsFor(
  channel: ReminderJob["channel"],
  to: string,
  installments: Installment[],
  eventName: string,
): ReminderJob[] {
  return installments
    .filter((item) => !item.paid)
    .map((item, index) => ({
      id: `${channel}-${item.date}-${index}`,
      channel,
      to,
      scheduledFor: item.date,
      status: "simulated" as const,
      message: `Recordatorio de pago ${index + 1} para ${eventName}: ${new Intl.NumberFormat(
        "es-MX",
        { style: "currency", currency: "MXN" },
      ).format(item.amount)} a más tardar el ${new Date(item.date).toLocaleDateString("es-MX")}.`,
    }));
}

export const notificationHooks: NotificationScheduler = {
  async scheduleWhatsApp(to, installments, eventName) {
    const jobs = jobsFor("whatsapp", to, installments, eventName);
    console.info("[notificaciones] WhatsApp simulado", jobs);
    return jobs;
  },
  async scheduleEmail(to, installments, eventName) {
    const jobs = jobsFor("email", to, installments, eventName);
    console.info("[notificaciones] Correo simulado", jobs);
    return jobs;
  },
};

export function whatsAppPreviewUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
