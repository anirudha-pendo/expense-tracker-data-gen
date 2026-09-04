import { useCallback, useEffect, useState } from "react";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import type { Category } from "@/types";

export function useCategories(workspaceId: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const cats = await getCategoriesByWorkspaceId(workspaceId);
      setCategories(cats);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { categories, isLoading, reload };
}
