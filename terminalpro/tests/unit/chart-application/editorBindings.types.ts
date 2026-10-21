import type { ApplicationChartEditorProps } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import type { PieEditIntent } from "../../../src/components/General/Table/Chart/application/pieSessionTypes";
import type { ApplicationEditorIntent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
type SameIntent = Parameters<
  ApplicationChartEditorProps["onIntent"]
>[0] extends ApplicationEditorIntent | PieEditIntent
  ? true
  : false;
const acceptsOnlyRequestedIntent: SameIntent = true;
void acceptsOnlyRequestedIntent;
