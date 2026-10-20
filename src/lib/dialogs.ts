export type DialogRequest = {
  message: string;
  confirm: boolean;
  resolve: (accepted: boolean) => void;
};

const queue: DialogRequest[] = [];
const listeners = new Set<() => void>();
export const currentDialog = () => queue[0] ?? null;
export function subscribeDialogs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function request(message: string, confirm: boolean) {
  return new Promise<boolean>((resolve) => {
    queue.push({ message, confirm, resolve });
    listeners.forEach((listener) => listener());
  });
}
export function showAlert(message: string) { void request(message, false); }
export function askConfirmation(message: string) { return request(message, true); }
export function settleDialog(accepted: boolean) {
  queue.shift()?.resolve(accepted);
  listeners.forEach((listener) => listener());
}
