import type { EventName } from './types';

class EventBus {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: EventName | string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: EventName | string, handler: (...args: unknown[]) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event: EventName | string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  clear(event?: EventName | string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  getListeners(event: EventName | string): Set<(...args: unknown[]) => void> | undefined {
    return this.listeners.get(event);
  }
}

export const eventBus = new EventBus();

export default EventBus;