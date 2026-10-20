import type { StopRef } from '../../types/bus';

// The bus ride the alarm is for: the tracked bus from its boarding stop to the stop to get off at
export interface AlarmRide {
  key: string; // a different bus or stop is a new ride, and turns the alarm off
  serviceNo: string;
  stops: StopRef[]; // boarding stop first, the stop to get off at last
}
