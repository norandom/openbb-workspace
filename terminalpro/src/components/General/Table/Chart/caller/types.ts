import type { EChartsHostHandle } from "../echarts/EChartsHost";
import type { SessionResult, SessionStamp } from "../application/types";
import type { ApplicationChartFamily } from "../application/comboSessionTypes";

export interface ApplicationChartHandle {
  readonly host: EChartsHostHandle;
  readonly stamp: SessionStamp;
  readonly revision: number;
  readonly family: ApplicationChartFamily;
  readonly seriesCount: number;
  readonly validateCurrent: (
    stamp: SessionStamp,
  ) => SessionResult<SessionStamp>;
}
