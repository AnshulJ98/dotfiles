import { a } from "@/core/a";
import { b } from "./b.js";

export const View = ({ n }: { n: number }) => <p>{a({ w: n, h: b() })}</p>;
