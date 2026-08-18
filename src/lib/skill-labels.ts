const DIRECT_SKILL_LABELS: Record<string, string> = {
  "identify-monomial": "Nhận biết đơn thức",
  "reduce-monomial": "Rút gọn đơn thức",
  "multiply-monomials": "Nhân các đơn thức",
  "divide-monomials": "Chia các đơn thức",
  "evaluate-monomial": "Tính giá trị của đơn thức",
  "determine-degree": "Xác định bậc",
  "combine-like-terms": "Gộp các hạng tử đồng dạng",
  "factor-common-term": "Đặt nhân tử chung",
  "solve-equation": "Giải phương trình",
  "detect-lost-solution": "Phát hiện nghiệm bị mất",
};

const ACTION_LABELS: Record<string, string> = {
  apply: "Áp dụng",
  calculate: "Tính",
  classify: "Phân loại",
  combine: "Gộp",
  compare: "So sánh",
  detect: "Phát hiện",
  determine: "Xác định",
  divide: "Chia",
  evaluate: "Tính giá trị",
  expand: "Khai triển",
  factor: "Phân tích nhân tử",
  identify: "Nhận biết",
  model: "Mô hình hóa",
  multiply: "Nhân",
  prove: "Chứng minh",
  reduce: "Rút gọn",
  represent: "Biểu diễn",
  simplify: "Rút gọn",
  solve: "Giải",
  use: "Vận dụng",
};

const OBJECT_LABELS: Record<string, string> = {
  arc: "cung",
  area: "diện tích",
  binomial: "nhị thức",
  circle: "đường tròn",
  coefficient: "hệ số",
  combination: "tổ hợp",
  common: "chung",
  condition: "điều kiện",
  degree: "bậc",
  diameter: "đường kính",
  equation: "phương trình",
  expression: "biểu thức",
  factorial: "giai thừa",
  function: "hàm số",
  graph: "đồ thị",
  monomial: "đơn thức",
  monomials: "các đơn thức",
  polynomial: "đa thức",
  radius: "bán kính",
  solution: "nghiệm",
  term: "hạng tử",
  terms: "hạng tử",
  value: "giá trị",
  volume: "thể tích",
};

export function skillDisplayName(
  value: string,
  labels?: Record<string, string>,
) {
  if (!value) return "";
  const direct = labels?.[value];
  if (direct) return direct;
  const leaf = skillLeaf(value);
  if (labels?.[leaf]) return labels[leaf];
  if (DIRECT_SKILL_LABELS[leaf]) return DIRECT_SKILL_LABELS[leaf];

  const words = leaf.split(/[-_]+/).filter(Boolean);
  if (!words.length) return value;
  const [first, ...rest] = words;
  const action = ACTION_LABELS[first];
  const objects = rest.map((word) => OBJECT_LABELS[word] || word).join(" ");
  if (action && objects) return `${action} ${objects}`;
  if (action) return action;
  return humanizeSkillLeaf(leaf);
}

export function skillLabelMap(
  skills?: Array<{ skill_id: string; label_vi?: string | null }>,
) {
  return Object.fromEntries(
    (skills || [])
      .filter((item) => item.skill_id && item.label_vi)
      .flatMap((item) => [
        [item.skill_id, item.label_vi || ""],
        [skillLeaf(item.skill_id), item.label_vi || ""],
      ]),
  );
}

function skillLeaf(value: string) {
  return value.split("#").pop()?.split(":").pop() || value;
}

function humanizeSkillLeaf(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}
