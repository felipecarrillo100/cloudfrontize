import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names, letting later Tailwind utilities override earlier ones. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
