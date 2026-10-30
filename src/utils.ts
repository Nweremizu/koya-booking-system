type SortOrder = "asc" | "desc";
type SortType = "string" | "number" | "date";

export function sortBy<T, K extends keyof T>(
  items: T[],
  field: K,
  order: SortOrder = "asc",
  type: SortType = "string",
): T[] {
  const direction = order === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const valueA = a[field];
    const valueB = b[field];

    // Keep null and undefined values at the end
    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return 1;
    if (valueB == null) return -1;

    let comparison = 0;

    switch (type) {
      case "date":
        comparison =
          new Date(String(valueA)).getTime() -
          new Date(String(valueB)).getTime();
        break;

      case "number":
        comparison = Number(valueA) - Number(valueB);
        break;

      case "string":
        comparison = String(valueA).localeCompare(String(valueB), undefined, {
          sensitivity: "base",
        });
        break;
    }

    return comparison === 0 ? 0 : comparison > 0 ? direction : -direction;
  });
}
