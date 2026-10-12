"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  CAMPUSES,
  DEFAULT_CAMPUS,
  parseCampus,
  resolveWorkingCampus,
  type Campus,
  type DataCampus,
} from "@/lib/campus";

const STORAGE = "boletos-working-campus";

interface CampusValue {
  userCampus: Campus;
  campus: DataCampus;
  setCampus: (campus: DataCampus) => void;
  canSwitch: boolean;
}

const Ctx = createContext<CampusValue | null>(null);

export function CampusProvider({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const userCampus: Campus = data?.user?.campus ?? DEFAULT_CAMPUS;
  const [picked, setPicked] = useState<DataCampus>(DEFAULT_CAMPUS);

  useEffect(() => {
    try {
      const stored = parseCampus(localStorage.getItem(STORAGE) ?? "");
      if (stored && stored !== "ALL") setPicked(stored);
    } catch {
      // ignore
    }
  }, []);

  const campus = resolveWorkingCampus(userCampus, picked);
  const canSwitch = userCampus === "ALL";

  const value = useMemo<CampusValue>(
    () => ({
      userCampus,
      campus,
      canSwitch,
      setCampus: (next) => {
        if (!canSwitch) return;
        setPicked(next);
        try {
          localStorage.setItem(STORAGE, next);
        } catch {
          // ignore
        }
      },
    }),
    [userCampus, campus, canSwitch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCampus() {
  const value = useContext(Ctx);
  if (!value) {
    return {
      userCampus: DEFAULT_CAMPUS as Campus,
      campus: DEFAULT_CAMPUS,
      setCampus: () => undefined,
      canSwitch: false,
    };
  }
  return value;
}

export const CAMPUS_OPTIONS = CAMPUSES.filter((item): item is DataCampus => item !== "ALL");
