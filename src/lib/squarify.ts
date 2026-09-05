/** Squarified treemap layout (GMT-compatible algorithm) */

export interface SquarifyRect<T> {
  it: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function squarify<T>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number,
  val: (it: T) => number
): SquarifyRect<T>[] {
  const out: SquarifyRect<T>[] = [];
  const total = items.reduce((s, it) => s + val(it), 0);
  if (total <= 0 || w <= 0 || h <= 0) return out;

  const scale = (w * h) / total;
  let row: T[] = [];
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;

  function worst(r: T[], len: number) {
    let s = 0;
    let mx = 0;
    let mn = Infinity;
    for (const it of r) {
      const a = val(it) * scale;
      s += a;
      mx = Math.max(mx, a);
      mn = Math.min(mn, a);
    }
    const l2 = len * len;
    const s2 = s * s;
    return Math.max((l2 * mx) / s2, s2 / (l2 * mn));
  }

  function layoutRow(r: T[]) {
    const s = r.reduce((a, it) => a + val(it) * scale, 0);
    if (rw >= rh) {
      const cw = s / rh;
      let yy = ry;
      for (const it of r) {
        const a = val(it) * scale;
        const ih = a / cw;
        out.push({ it, x: rx, y: yy, w: cw, h: ih });
        yy += ih;
      }
      rx += cw;
      rw -= cw;
    } else {
      const rhh = s / rw;
      let xx = rx;
      for (const it of r) {
        const a = val(it) * scale;
        const iw = a / rhh;
        out.push({ it, x: xx, y: ry, w: iw, h: rhh });
        xx += iw;
      }
      ry += rhh;
      rh -= rhh;
    }
  }

  for (const it of items) {
    const len = Math.min(rw, rh);
    if (row.length === 0 || worst(row, len) >= worst([...row, it], len)) row.push(it);
    else {
      layoutRow(row);
      row = [it];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

export const MIN_TILE = 24;
