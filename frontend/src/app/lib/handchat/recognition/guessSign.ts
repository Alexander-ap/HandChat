type PointLike = { x: number; y: number; z?: number };

export function guessSign(hand: any): string {
  const keypoints: PointLike[] = (hand?.keypoints3D || hand?.keypoints || hand) as PointLike[];
  if (!Array.isArray(keypoints) || keypoints.length < 21) return "";

  const wrist = keypoints[0];
  const thumbMcp = keypoints[2],
    thumbIp = keypoints[3],
    thumbTip = keypoints[4];
  const indexMcp = keypoints[5],
    indexPip = keypoints[6],
    indexDip = keypoints[7],
    indexTip = keypoints[8];
  const middleMcp = keypoints[9],
    middlePip = keypoints[10],
    middleDip = keypoints[11],
    middleTip = keypoints[12];
  const ringMcp = keypoints[13],
    ringPip = keypoints[14],
    ringDip = keypoints[15],
    ringTip = keypoints[16];
  const pinkyMcp = keypoints[17],
    pinkyPip = keypoints[18],
    pinkyDip = keypoints[19],
    pinkyTip = keypoints[20];

  const dist = (a: PointLike, b: PointLike) =>
    Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

  const angleBetween = (a: PointLike, b: PointLike, c: PointLike) => {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.hypot(v1.x, v1.y, v1.z);
    const mag2 = Math.hypot(v2.x, v2.y, v2.z);
    if (mag1 === 0 || mag2 === 0) return 180;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  };

  const isFingerStraight = (mcp: PointLike, pip: PointLike, dip: PointLike, tip: PointLike) =>
    angleBetween(mcp, pip, dip) > 120 && dist(wrist, tip) > dist(wrist, pip);

  const indexUp = isFingerStraight(indexMcp, indexPip, indexDip, indexTip);
  const middleUp = isFingerStraight(middleMcp, middlePip, middleDip, middleTip);
  const ringUp = isFingerStraight(ringMcp, ringPip, ringDip, ringTip);
  const pinkyUp = isFingerStraight(pinkyMcp, pinkyPip, pinkyDip, pinkyTip);

  const thumbAngle = angleBetween(thumbMcp, thumbIp, thumbTip);
  const thumbUp = thumbAngle > 140;
  const thumbOut = dist(thumbTip, indexMcp) > dist(wrist, indexMcp) * 0.6;

  const palmSize = dist(wrist, indexMcp);
  const isThumbIndexTouching = dist(thumbTip, indexTip) < palmSize * 0.4;

  if (isThumbIndexTouching && middleUp && ringUp && pinkyUp) return "好的";

  if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
    if (thumbTip.y < wrist.y) return "非常棒";
    return "不好";
  }

  if (indexUp && !middleUp && !ringUp && pinkyUp && thumbOut) return "我爱你";
  if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "一";
  if (indexUp && middleUp && !ringUp && !pinkyUp) return "二";
  if (indexUp && middleUp && ringUp && !pinkyUp) return "三";
  if (indexUp && middleUp && ringUp && pinkyUp && !thumbOut) return "四";
  if (indexUp && middleUp && ringUp && pinkyUp && thumbOut) return "你好";
  if (!indexUp && !middleUp && !ringUp && !pinkyUp && (!thumbUp || !thumbOut)) return "握拳";

  return "";
}

