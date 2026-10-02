import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control = 'h-9 w-full rounded-md border border-line bg-bg px-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none aria-[invalid=true]:border-danger'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}

/** A labelled form control with its hint and error, wired for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">{label}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': described })}
      {error ? <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(control, 'pr-8', className)} {...props} />
})
