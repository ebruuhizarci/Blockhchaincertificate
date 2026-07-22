import { useCallback, useEffect, useState } from "react";
import { INSTITUTION_OPTIONS } from "@/config/institutions";
import { apiFetch } from "@/lib/http";

export type InstitutionOption = {
  code: string;
  label: string;
};

type InstitutionsResponse = {
  institutions?: { id: number; code: string; name: string }[];
  error?: string;
};

export async function fetchInstitutionOptions(): Promise<InstitutionOption[]> {
  try {
    const { data, res } = await apiFetch<InstitutionsResponse>("/institutions");
    if (!res.ok || !data.institutions?.length) {
      return [...INSTITUTION_OPTIONS];
    }
    return data.institutions.map((i) => ({
      code: i.code,
      label: i.name,
    }));
  } catch {
    return [...INSTITUTION_OPTIONS];
  }
}

export function useInstitutionOptions() {
  const [options, setOptions] = useState<InstitutionOption[]>([
    ...INSTITUTION_OPTIONS,
  ]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await fetchInstitutionOptions();
    setOptions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { options, loading, reload };
}
