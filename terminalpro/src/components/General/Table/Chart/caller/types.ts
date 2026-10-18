import type { EChartsHostHandle } from "../echarts/EChartsHost";
import type { SessionResult, SessionStamp } from "../application/types";

export interface ApplicationChartHandle {
  readonly host: EChartsHostHandle;
  readonly stamp: SessionStamp;
  readonly revision: number;
  readonly validateCurrent: (stamp: SessionStamp) => SessionResult<SessionStamp>;
}
