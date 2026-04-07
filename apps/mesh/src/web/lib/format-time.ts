import { differenceInSeconds } from "date-fns";

export function formatTimeAgo(date: Date): string {
  const seconds = differenceInSeconds(new Date(), date);

  if (seconds < 60) return "<1m";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
  return `${Math.floor(seconds / 31536000)}y ago`;
}

export function formatTimeUntil(date: Date): string {
  const seconds = differenceInSeconds(date, new Date());

  if (seconds < 0) return "now";
  if (seconds < 60) return "<1m";
  if (seconds < 3600) return `in ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `in ${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `in ${Math.floor(seconds / 86400)}d`;
  return `in ${Math.floor(seconds / 604800)}w`;
}
