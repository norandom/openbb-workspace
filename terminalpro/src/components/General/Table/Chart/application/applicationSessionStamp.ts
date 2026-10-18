import type { ValidateSynchronousEditorStamp } from "../compatibility/editorBindings/types";
import { validateSessionStamp } from "./sessionState";

/** Only immediate controls may reuse a view after an option-only redraw. */
export const validateSynchronousEditorStamp: ValidateSynchronousEditorStamp = (
  viewStamp,
  currentStamp,
) => {
  const view = validateSessionStamp(viewStamp, viewStamp);
  if (view.status !== "ready") return view;
  const current = validateSessionStamp(currentStamp, currentStamp);
  if (current.status !== "ready") return current;
  return validateSessionStamp(
    { ...view.stamp, renderRevision: current.stamp.renderRevision },
    current.stamp,
  );
};
