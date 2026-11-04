/**
 * Compare two version strings like "1.4.0" or "1.5.0-beta.2".
 * Returns  1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ''] = v.replace(/^v/, '').split('-', 2)
    const nums = core.split('.').map((n) => parseInt(n, 10) || 0)
    while (nums.length < 3) nums.push(0)
    return { nums, pre }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] > pb.nums[i] ? 1 : -1
  }
  // A release (no "-beta") is newer than a pre-release of the same number
  if (pa.pre === pb.pre) return 0
  if (!pa.pre) return 1
  if (!pb.pre) return -1
  return pa.pre.localeCompare(pb.pre, undefined, { numeric: true }) > 0 ? 1 : -1
}
