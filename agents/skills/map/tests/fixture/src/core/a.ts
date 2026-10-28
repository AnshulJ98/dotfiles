import { b } from "./b";

export interface Shape { w: number; h: number }

export function a(shape: Shape): number {
  return shape.w * b();
}

export const area = (s: Shape): number => s.w * s.h;
