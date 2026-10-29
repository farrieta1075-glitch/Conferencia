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

export function whatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("52") && digits.length >= 12) return digits;
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

export function whatsAppPreviewUrl(phone: string, message: string): string {
  const text = message.normalize("NFC");
  return `https://api.whatsapp.com/send?phone=${whatsAppDigits(phone)}&text=${encodeURIComponent(text)}`;
}

export async function copyText(value: string): Promise<boolean> {
  const text = value.normalize("NFC");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function openWhatsAppChat(phone: string, message: string): Promise<boolean> {
  const copied = await copyText(message);
  window.open(whatsAppPreviewUrl(phone, message), "_blank", "noopener,noreferrer");
  return copied;
}
