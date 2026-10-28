import { a } from "./a";

export function b(): number {
  return 1;
}

export const twice = (n: number) => a({ w: n, h: 1 }) * 2;
