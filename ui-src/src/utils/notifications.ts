import { toast } from 'sonner';

/**
 * Notification adapter — wraps the toast library behind a stable interface.
 *
 * The library (sonner) is referenced ONLY in this file.
 * To swap it for another toast solution, change only this file.
 * All app code calls `notify.*` and is unaffected by the underlying library.
 */
export const notify = {
    success: (msg: string) => toast.success(msg),
    error:   (msg: string) => toast.error(msg),
    loading: (msg: string) => toast.loading(msg),
    dismiss: (id?: string | number) => toast.dismiss(id),
};
