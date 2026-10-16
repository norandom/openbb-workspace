import type { FC } from "react";
import { memo } from "react";
import type { ArtifactT, SnowflakeArtifactT } from "~/lib/state/copilot";
import type { ArtifactProps } from "./artifacts/ArtifactShared";

export type { ArtifactProps } from "./artifacts/ArtifactShared";

import { AppArtifact } from "./artifacts/AppArtifact";
import { ChartArtifact } from "./artifacts/ChartArtifact";
import { HTMLArtifact } from "./artifacts/HTMLArtifact";
import { SnowflakeArtifact } from "./artifacts/SnowflakeArtifact";
import { TableArtifact } from "./artifacts/TableArtifact";
import { TextArtifact } from "./artifacts/TextArtifact";

export { ChartArtifact, SnowflakeArtifact };

type ComponentMapT = { [K in ArtifactT["type"]]: FC<ArtifactProps<K>> };
const ComponentMap: ComponentMapT = {
  chart: ChartArtifact,
  html: HTMLArtifact,
  snowflake_query: SnowflakeArtifact,
  snowflake_python: SnowflakeArtifact,
  text: TextArtifact,
  table: TableArtifact,
  app: AppArtifact,
};

function getArtifactComponent<T extends ArtifactT["type"]>(props: ArtifactProps<T>) {
  if (props.artifact.type in ComponentMap) {
    const Component = ComponentMap[props.artifact.type] as FC<ArtifactProps<T>>;
    return <Component {...props} key={`artifact-${props.artifact.uuid}-root`} />;
  }
  return null;
}

export function isSnowflakeArtifact(
  artifact: ArtifactT,
): artifact is SnowflakeArtifactT {
  return artifact.type === "snowflake_query" || artifact.type === "snowflake_python";
}

export const Artifact = memo<ArtifactProps>((props) => getArtifactComponent(props));

Artifact.displayName = "Artifact";

export default Artifact;
