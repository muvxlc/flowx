import type { AlarmClock, AlarmEvent } from './types.ts';

interface ScheduledAlarm {
  readonly name: string;
  readonly periodMs: number;
  nextTriggerTime: number;
}

export class FakeAlarmClock implements AlarmClock {
  private currentTime = 1_000_000;
  private readonly alarms = new Map<string, ScheduledAlarm>();
  private readonly listeners: Array<(alarm: AlarmEvent) => void | Promise<void>> = [];

  now(): number {
    return this.currentTime;
  }

  async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 15)));
  }

  createAlarm(name: string, periodInMinutes: number): void {
    const periodMs = Math.max(1, periodInMinutes) * 60_000;
    this.alarms.set(name, {
      name,
      periodMs,
      nextTriggerTime: this.currentTime,
    });
  }

  scheduleWakeup(name: string, delayMs: number): void {
    const alarm = this.alarms.get(name);
    const triggerTime = this.currentTime + delayMs;
    if (alarm) {
      alarm.nextTriggerTime = triggerTime;
    } else {
      this.alarms.set(name, {
        name,
        periodMs: 60_000,
        nextTriggerTime: triggerTime,
      });
    }
  }

  clearAlarm(name: string): void {
    this.alarms.delete(name);
  }

  onAlarm(listener: (alarm: AlarmEvent) => void | Promise<void>): void {
    this.listeners.push(listener);
  }

  async tick(advanceMs: number): Promise<void> {
    this.currentTime += advanceMs;

    // Process alarms that became due
    for (const [name, alarm] of this.alarms.entries()) {
      if (alarm.nextTriggerTime <= this.currentTime) {
        // Coalesce overdue alarm: trigger exactly once
        const event: AlarmEvent = { name, scheduledTime: alarm.nextTriggerTime };
        // Advance nextTriggerTime to future
        while (alarm.nextTriggerTime <= this.currentTime) {
          alarm.nextTriggerTime += alarm.periodMs;
        }
        for (const listener of this.listeners) {
          await listener(event);
        }
      }
    }
  }
}

export class SystemAlarmClock implements AlarmClock {
  private readonly listeners: Array<(alarm: AlarmEvent) => void | Promise<void>> = [];

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.onAlarm.addListener((alarm) => {
        for (const listener of this.listeners) {
          listener({ name: alarm.name, scheduledTime: alarm.scheduledTime });
        }
      });
    }
  }

  now(): number {
    return Date.now();
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  createAlarm(name: string, periodInMinutes: number): void {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create(name, { periodInMinutes });
    }
  }

  scheduleWakeup(name: string, delayMs: number): void {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create(name, { when: Date.now() + delayMs });
    }
  }

  clearAlarm(name: string): void {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear(name);
    }
  }

  onAlarm(listener: (alarm: AlarmEvent) => void | Promise<void>): void {
    this.listeners.push(listener);
  }
}
