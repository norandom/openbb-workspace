import { createContext, useContext } from "react";
import type { WidgetTransactionAdapter } from "./widgetSync/transactions";

/** The committed pair comes from the existing Widget reducer, never a second store. */
export const WidgetTransactionContext = createContext<
  WidgetTransactionAdapter | undefined
>(undefined);
export function useWidgetTransactionContext(): WidgetTransactionAdapter {
  const owner = useContext(WidgetTransactionContext);
  if (!owner) throw new Error("Chart transactions require the Widget provider");
  return owner;
}
