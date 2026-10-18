import type { EChartsHostHandle } from "../echarts/EChartsHost";
import type { SessionResult, SessionStamp } from "../application/types";
import type { CartesianFamily } from "../echarts/cartesianTypes";

export interface ApplicationChartHandle {
  readonly host: EChartsHostHandle;
  readonly stamp: SessionStamp;
  readonly revision: number;
  readonly family: CartesianFamily;
  readonly seriesCount: number;
  readonly validateCurrent: (stamp: SessionStamp) => SessionResult<SessionStamp>;
}
