import { useEffect, useRef } from "react";

/** Registers the latest `run` with parent — never invokes it. */
export function useRegisterAiRun(
  registerRun: ((run: (() => Promise<void>) | null) => void) | undefined,
  run: () => Promise<void>,
) {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!registerRun) return;
    const invoke = () => runRef.current();
    registerRun(invoke);
    return () => registerRun(null);
  }, [registerRun]);
}
