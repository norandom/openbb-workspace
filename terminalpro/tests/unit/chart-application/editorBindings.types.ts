import type { ApplicationChartEditorProps } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import type { ApplicationEditorIntent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
type SameIntent = Parameters<
  ApplicationChartEditorProps["onIntent"]
>[0] extends ApplicationEditorIntent
  ? true
  : false;
const acceptsOnlyIntent: SameIntent = true;
void acceptsOnlyIntent;
