import * as React from "react";

type SetStateFn<T> = React.Dispatch<React.SetStateAction<T>>;

interface UseControllableStateParams<T> {
  prop?: T;
  defaultProp?: T;
  onChange?: (state: T) => void;
}

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>) {
  const [uncontrolledState, setUncontrolledState] = React.useState<T | undefined>(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledState;

  const setValue: SetStateFn<T | undefined> = React.useCallback(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (prev: T | undefined) => T | undefined)(value)
          : nextValue;

      if (isControlled) {
        if (resolvedValue !== prop) {
          onChange?.(resolvedValue as T);
        }
        return;
      }

      setUncontrolledState(resolvedValue);
      onChange?.(resolvedValue as T);
    },
    [isControlled, onChange, prop, value]
  );

  return [value, setValue] as const;
}
