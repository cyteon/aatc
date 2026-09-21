export function distNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = (lat2 - lat1) * 60;
  const dLon =
    (lon2 - lon1) * 60 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);

  return Math.hypot(dLat, dLon);
}
