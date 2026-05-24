const form = document.querySelector("#applicantForm");
const successBox = document.querySelector("#successBox");
const agencyHint = document.querySelector("#agencyHint");

const params = new URLSearchParams(window.location.search);
const agencyKey = (params.get("agency") || "").trim();

if (!agencyKey) {
  if (agencyHint) agencyHint.textContent = "提示：当前链接没有指定中介公司，请联系业务员获取专属登记链接。";
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.title = "需要业务员发送的专属登记链接";
  }
} else if (agencyHint) {
  agencyHint.textContent = "登记后会进入中介公司专属人才库（中介标识：" + agencyKey + "）";
}

async function api(path, options) {
  options = options || {};
  const response = await fetch(path, Object.assign({
    headers: { "Content-Type": "application/json" }
  }, options));
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "提交失败");
  return payload;
}

function toApplicantPayload(formData) {
  const rawTags = formData.get("tags") || "";
  const housing = formData.get("housing") || "";
  const tags = rawTags.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (housing) tags.push(housing);
  const g = (k) => (formData.get(k) || "").toString().trim();
  return {
    companyKey: agencyKey,
    name: g("name"),
    phone: g("phone"),
    gender: formData.get("gender") || "",
    age: formData.get("age") || "",
    location: g("location"),
    available: g("available"),
    period: formData.get("period") || "",
    expectedRole: g("expectedRole"),
    salary: g("salary"),
    score: 75,
    tags: tags,
    note: g("note"),
    source: "求职者自助登记"
  };
}

form.addEventList