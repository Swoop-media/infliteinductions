// @ts-nocheck

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Consistent date formatting that avoids hydration mismatches
export function formatDateConsistent(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    // Check for invalid date
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // Use UTC to ensure consistency between server and client
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const utcMonth = months[date.getUTCMonth()];
    const utcDay = date.getUTCDate();
    const utcYear = date.getUTCFullYear();
    
    return `${utcMonth} ${utcDay}, ${utcYear}`;
  } catch {
    return '';
  }
}
