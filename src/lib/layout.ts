import type { AreaId } from "./types";
import { MAP } from "./constants";

const DEG = Math.PI / 180;

export interface Wedge {
  rInner: number;
  rOuter: number;
  thetaStart: number;
  thetaEnd: number;
}

function w(rInner: number, rOuter: number, degStart: number, degEnd: number): Wedge {
  return {
    rInner,
    rOuter,
    thetaStart: degStart * DEG,
    thetaEnd: degEnd * DEG,
  };
}

function center(r0: number, r1: number, half: number): Wedge {
  return w(r0, r1, -half, half);
}

function left(r0: number, r1: number, inner: number, outer: number): Wedge {
  return w(r0, r1, -outer, -inner);
}

function right(r0: number, r1: number, inner: number, outer: number): Wedge {
  return w(r0, r1, inner, outer);
}

function aliases(parent: Wedge, ids: string[]): Record<string, Wedge> {
  return Object.fromEntries(ids.map((id) => [id, parent]));
}

/**
 * General.png: concentric rings (shared r) and mirrored left/right rails.
 * 102/105/108 share width and sit under 206 + half of 204.
 * 305 matches 303 in height (shorter than 206); 301 sits below both.
 * Gray walkway only under 402/401/403 (above 202/201/203).
 */
const R0 = 118;
const R1 = 188;
const R2 = 252;
const R3 = 318;
const R303 = 352;
const R4 = 400;
const R5 = 424;
const R6 = 548;
const R7 = 688;
const R105 = R1 + 0.25 * (R2 - R1);

const A101 = 18;
const A201 = 12;
const A202 = 24;
const A204 = 36;
const A206 = 50;
const A303 = 62;
const A305 = 72;

const A401 = 16;
const A402 = 30;
const A404 = A303;
const A406 = A305;

const A501 = 16;
const A502 = A402;
const A504 = A404;
const A506 = A406;

const S101 = center(R0, R1, A101);
const S102 = left(R0, R1, A101, A206);
const S103 = right(R0, R1, A101, A206);
const S104 = center(R1, R2, A101);
const S105 = left(R1, R2, A101, A206);
const S106 = right(R1, R2, A101, A206);
const S107 = center(R2, R3, A101);
const S108 = left(R2, R3, A101, A206);
const S109 = right(R2, R3, A101, A206);

const S301 = left(R105, R303, A206, A305);
const S302 = right(R105, R303, A206, A305);

const S201 = center(R3, R4, A201);
const S202 = left(R3, R4, A201, A202);
const S203 = right(R3, R4, A201, A202);
const S204 = left(R3, R4, A202, A204);
const S205 = right(R3, R4, A202, A204);
const S206 = left(R3, R4, A204, A206);
const S207 = right(R3, R4, A204, A206);
const S303 = left(R303, R4, A206, A303);
const S304 = right(R303, R4, A206, A303);
const S305 = left(R303, R4, A303, A305);
const S306 = right(R303, R4, A303, A305);

const S401 = center(R5, R6, A401);
const S402 = left(R5, R6, A401, A402);
const S403 = right(R5, R6, A401, A402);
const S404 = left(R4, R6, A402, A404);
const S405 = right(R4, R6, A402, A404);
const S406 = left(R4, R6, A404, A406);
const S407 = right(R4, R6, A404, A406);

const S501 = center(R6, R7, A501);
const S502 = left(R6, R7, A501, A502);
const S503 = right(R6, R7, A501, A502);
const S504 = left(R6, R7, A502, A504);
const S505 = right(R6, R7, A502, A504);
const S506 = left(R6, R7, A504, A506);
const S507 = right(R6, R7, A504, A506);

export const SECTION_LAYOUT: Record<string, Wedge> = {
  "101": S101,
  "102": S102,
  "103": S103,
  "104": S104,
  "105": S105,
  "106": S106,
  "107": S107,
  "108": S108,
  "109": S109,
  "201": S201,
  "202": S202,
  "203": S203,
  "204": S204,
  ...aliases(S204, ["204A", "204B", "204C"]),
  "205": S205,
  ...aliases(S205, ["205A", "205B", "205C"]),
  "206": S206,
  "207": S207,
  "301": S301,
  ...aliases(S301, ["301A", "301B"]),
  "302": S302,
  ...aliases(S302, ["302A", "302B"]),
  "303": S303,
  "304": S304,
  "305": S305,
  "306": S306,
  "401": S401,
  ...aliases(S401, ["401A", "401B"]),
  "402": S402,
  ...aliases(S402, ["402A", "402B"]),
  "403": S403,
  ...aliases(S403, ["403A", "403B"]),
  "404": S404,
  ...aliases(S404, ["404A", "404B", "404C"]),
  "405": S405,
  ...aliases(S405, ["405A", "405B", "405C"]),
  "406": S406,
  "407": S407,
  ...aliases(S407, ["407A", "407B"]),
  "501": S501,
  ...aliases(S501, ["501A", "501B"]),
  "502": S502,
  ...aliases(S502, ["502A", "502B"]),
  "503": S503,
  ...aliases(S503, ["503A", "503B"]),
  "504": S504,
  "505": S505,
  "506": S506,
  "507": S507,
  ...aliases(S507, ["507A", "507B"]),
};

export const FALLBACK_RINGS: Record<AreaId, { rInner: number; rOuter: number; span: number }> = {
  preferente: { rInner: R0, rOuter: R3, span: 2 * A305 * DEG },
  luneta: { rInner: R3, rOuter: R4, span: 2 * A206 * DEG },
  balcon: { rInner: R105, rOuter: R4, span: 2 * A305 * DEG },
  "primer-piso": { rInner: R4, rOuter: R6, span: 2 * A305 * DEG },
  "segundo-piso": { rInner: R6, rOuter: R7, span: 2 * A305 * DEG },
};

export const WALKWAY: Wedge = center(R4, R5, A402);

const OUTER_SLICE = 10 * DEG;

export function fallbackWedge(
  areaId: AreaId,
  index: number,
  total: number,
  occupied: Wedge[] = [],
): Wedge {
  const ring = FALLBACK_RINGS[areaId];
  if (!occupied.length) {
    const sweep = ring.span / Math.max(total, 1);
    const start = -ring.span / 2 + index * sweep;
    return {
      rInner: ring.rInner,
      rOuter: ring.rOuter,
      thetaStart: start,
      thetaEnd: start + sweep,
    };
  }
  const outer = occupied.reduce((best, wedge) => {
    const abs = Math.max(Math.abs(wedge.thetaStart), Math.abs(wedge.thetaEnd));
    const bestAbs = Math.max(Math.abs(best.thetaStart), Math.abs(best.thetaEnd));
    return abs >= bestAbs ? wedge : best;
  });
  const maxAbs = Math.max(
    ...occupied.map((wedge) => Math.max(Math.abs(wedge.thetaStart), Math.abs(wedge.thetaEnd))),
  );
  const side = index % 2 === 0 ? 1 : -1;
  const rank = Math.floor(index / 2);
  const inner = maxAbs + rank * OUTER_SLICE;
  return {
    rInner: outer.rInner,
    rOuter: outer.rOuter,
    thetaStart: side > 0 ? inner : -inner - OUTER_SLICE,
    thetaEnd: side > 0 ? inner + OUTER_SLICE : -inner,
  };
}

export function toSectionGeometry(
  sectionId: string,
  areaId: AreaId,
  wedge: Wedge,
) {
  return { sectionId, areaId, ...wedge };
}

export { MAP };
