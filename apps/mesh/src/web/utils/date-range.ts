/**
 * Calculate a date range for the last 24 hours, rounded to the nearest minute
 * to ensure stable query keys. The end date is set to 1 hour in the future
 * to account for any clock skew.
 */
export function getLast24HoursDateRange(): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const startDate = new Date();
  startDate.setHours(now.getHours() - 24);
  // Round to nearest minute to ensure stable query keys
  startDate.setSeconds(0, 0);
  const endDate = new Date(now);
  endDate.setHours(endDate.getHours() + 1);
  endDate.setSeconds(0, 0);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

