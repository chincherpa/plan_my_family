/**
 * Side-by-side layout for overlapping blocks in one calendar column.
 * Items are grouped into clusters of transitively overlapping intervals;
 * each item gets the first free lane, and every item in a cluster shares
 * the cluster's lane count so widths line up.
 */
export interface LaneInput {
  start: number;
  end: number;
}

export interface LanePlacement {
  lane: number;
  lanes: number;
}

export function assignLanes<T extends LaneInput>(items: T[]): Map<T, LanePlacement> {
  const result = new Map<T, LanePlacement>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: T[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const item of cluster) result.get(item)!.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    result.set(item, { lane, lanes: 1 });
    cluster.push(item);
    clusterEnd = cluster.length === 1 ? item.end : Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}
