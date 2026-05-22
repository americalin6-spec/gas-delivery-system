export type CustomerWriteAction = "insert" | "update" | "blocked";

export type CustomerWriteEvent = {
  requestId: string;
  source: string;
  action: CustomerWriteAction;
  customer_name: string | null;
  phone: string | null;
  line_id: string | null;
  company_id: number;
  timestamp: string;
  detail?: string;
};

const MAX_EVENTS = 40;
const events: CustomerWriteEvent[] = [];
const listeners = new Set<() => void>();

export function logCustomerWrite(event: CustomerWriteEvent): void {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  console.log("[CUSTOMER_WRITE]", event.requestId, {
    source: event.source,
    action: event.action,
    customer_name: event.customer_name,
    phone: event.phone,
    line_id: event.line_id,
    company_id: event.company_id,
    timestamp: event.timestamp,
  });
  for (const listener of listeners) {
    listener();
  }
}

export function getCustomerWriteEvents(): CustomerWriteEvent[] {
  return [...events];
}

export function subscribeCustomerWriteEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearCustomerWriteEvents(): void {
  events.length = 0;
  for (const listener of listeners) {
    listener();
  }
}
