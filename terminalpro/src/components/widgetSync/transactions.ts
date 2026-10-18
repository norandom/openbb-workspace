import type { WidgetT } from "../types";

export interface WidgetTransactionScope {
  readonly token: symbol;
  readonly value: unknown;
}
export type WidgetTransaction<Value> = (
  widget: WidgetT,
  value: Value,
) => { readonly widget: WidgetT; readonly value: Value };
export type WidgetScopeAction =
  | {
      readonly type: "scope-register";
      readonly token: symbol;
      readonly initialize: (widget: WidgetT) => unknown;
    }
  | { readonly type: "scope-release"; readonly token: symbol };
export interface WidgetTransactionAdapter {
  readonly widget: WidgetT;
  readonly scope: WidgetTransactionScope | undefined;
  readonly register: <Value>(
    token: symbol,
    initialize: (widget: WidgetT) => Value,
  ) => void;
  readonly release: (token: symbol) => void;
  readonly transact: <Value>(token: symbol, reduce: WidgetTransaction<Value>) => void;
}
