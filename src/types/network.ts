// public/bus-routes/network.json, built at deploy time by scripts/build-bus-routes.ts from LTA DataMall.
// A compact copy of every stop and every service direction, for "buses near you", stop search and trip planning.

export type NetworkStopRow = [code: string, name: string, road: string, lat: number, lng: number];

// One service direction: stops are indexes into NetworkFile.stops; hopHm[k] is the road distance from the
// previous stop to stop k, in units of 100 m (hopHm[0] = 0)
export type NetworkPatternRow = [serviceNo: string, direction: number, stops: number[], hopHm: number[]];

export interface NetworkFile {
  generatedAt: string;
  stops: NetworkStopRow[];
  patterns: NetworkPatternRow[];
}
