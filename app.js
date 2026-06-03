const today = new Date();
const currentYear = today.getFullYear();

// ── 全局错误边界 ──────────────────────────────────
window.addEventListener('unhandledrejection', (event) => {
  console.error('[全局] 未处理的 Promise 拒绝:', event.reason);
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('[全局] 脚本错误:', event.error || event.message);
});

let data = {
  demands: [],
  workers: [],
  chat: []
};
let fuzzyItems = [];
let fuzzyKind = "demand";
let account = JSON.parse(localStorage.getItem("labor-account") || "null");

const els = {
  pageTitle: document.querySelector("#pageTitle"),
  accountBadge: document.querySelector("#accountBadge"),
  accountStatus: document.querySelector("#accountStatus"),
  accountMessage: document.querySelector("#accountMessage"),
  profilePanel: document.querySelector("#profilePanel"),
  profileForm: document.querySelector("#profileForm"),
  profileMessage: document.querySelector("#profileMessage"),
  changePwdForm: document.querySelector("#changePwdForm"),
  changePwdMessage: document.querySelector("#changePwdMessage"),
  resetPwdForm: document.querySelector("#resetPwdForm"),
  resetPwdMessage: document.querySelector("#resetPwdMessage"),
  sendRegCode: document.querySelector("#sendRegCode"),
  sendResetCode: document.querySelector("#sendResetCode"),
  showResetPwd: document.querySelector("#showResetPwd"),
  sideSummary: document.querySelector("#sideSummary"),
  metrics: document.querySelector("#metrics"),
  fuzzyText: document.querySelector("#fuzzyText"),
  fuzzyFile: document.querySelector("#fuzzyFile"),
  fuzzyResults: document.querySelector("#fuzzyResults"),
  fuzzyCount: document.querySelector("#fuzzyCount"),
  fuzzyStatus: document.querySelector("#fuzzyStatus"),
  urgentList: document.querySelector("#urgentList"),
  taskList: document.querySelector("#taskList"),
  yearSelect: document.querySelector("#yearSelect"),
  companyFilter: document.querySelector("#companyFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  calendarGrid: document.querySelector("#calendarGrid"),
  demandSearch: document.querySelector("#demandSearch"),
  demandTable: document.querySelector("#demandTable"),
  workerSearch: document.querySelector("#workerSearch"),
  workerGrid: document.querySelector("#workerGrid"),
  knowledgeSearch: document.querySelector("#knowledgeSearch"),
  knowledgeMetrics: document.querySelector("#knowledgeMetrics"),
  knowledgeList: document.querySelector("#knowledgeList"),
  knowledgeForm: document.querySelector("#knowledgeForm"),
  knowledgeBatchForm: document.querySelector("#knowledgeBatchForm"),
  insightList: document.querySelector("#insightList"),
  knowledgeSummary: document.querySelector("#knowledgeSummary"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(account?.token ? { Authorization: `Bearer ${account.token}` } : {}) },
    ...options
  });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

async function uploadApi(path, formData) {
  const response = await fetch(path, {
    method: "POST",
    headers: account?.token ? { Authorization: `Bearer ${account.token}` } : {},
    body: formData
  });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
  if (!response.ok) throw new Error(payload.error || "上传失败");
  return payload;
}

async function loadData() {
  const payload = await api("/api/data");
  if (payload.account) {
    account = payload.account;
    localStorage.setItem("labor-account", JSON.stringify(account));
  } else {
    // 后台说当前未登录（token 失效或服务端重启）；清掉前端的过期账号信息，避免 UI 显示已登录但数据是 demo
    account = null;
    localStorage.removeItem("labor-account");
  }
  data = payload;
  renderAccount();
  renderAll();
}

function remaining(demand) {
  return Math.max(Number(demand.headcount) - Number(demand.signed || 0), 0);
}

function monthOf(dateText) {
  return new Date(`${dateText}T00:00:00`).getMonth();
}

function formatDateRange(demand) {
  const start = demand.start?.slice(5) || "待定";
  const end = demand.end ? demand.end.slice(5) : "长期";
  return `${start} 至 ${end}`;
}

function daysUntil(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return Math.ceil((date - today) / 86400000);
}

function tag(text, extra = "") {
  return `<span class="badge ${extra}">${escapeHtml(text)}</span>`;
}

function renderAll() {
  renderSidebar();
  renderDashboard();
  renderCalendar();
  renderDemandTable();
  renderWorkers();
  renderKnowledgeBase();
  renderKnowledge();
  renderChat();
}

renderFuzzyResults();

// ── 角色权限矩阵 ──────────────────────────────────
const ROLE_PERMISSIONS = {
  demands: { write: ["owner", "sales"], delete: ["owner", "sales"] },
  workers: { write: ["owner", "sales", "service"], delete: ["owner", "sales"] },
  pipeline: { assign: ["owner", "sales"], advance: ["owner", "dispatcher"], revert: ["owner", "dispatcher"] },
  knowledge: { write: ["owner", "service"] },
  collector: { write: ["owner", "sales"] },
  account: { write: ["owner"] },
};

function hasRole(view, action) {
  const perm = ROLE_PERMISSIONS[view];
  if (!perm || !perm[action]) return false;
  return perm[action].includes("all") || (account && perm[action].includes(account.role));
}

function renderPermissions() {
  const role = account ? account.role : null;
  document.querySelectorAll(".nav-item[data-role]").forEach(item => {
    const roles = item.dataset.role;
    if (roles === "all") { item.style.display = ""; }
    else if (role) {
      const allowed = roles.split(",").map(r => r.trim());
      item.style.display = allowed.includes(role) ? "" : "none";
    } else { item.style.display = ""; }
  });
  document.querySelectorAll("[data-role]:not(.nav-item)").forEach(item => {
    const roles = item.dataset.role;
    if (role && roles) {
      const allowed = roles.split(",").map(r => r.trim());
      if (!allowed.includes("all") && !allowed.includes(role)) { item.style.display = "none"; return; }
    }
    item.style.display = "";
  });
  document.querySelectorAll("[data-perm]").forEach(el => {
    const [view, action] = el.dataset.perm.split(".");
    el.style.display = hasRole(view, action) ? "" : "none";
  });
  document.querySelectorAll("[data-write]").forEach(el => {
    if (el.dataset.role || el.dataset.perm) return;
    const view = el.dataset.write;
    const allowed = (view && ROLE_PERMISSIONS[view]) ? ROLE_PERMISSIONS[view].write || [] : [];
    if (role && view && allowed.length > 0) {
      el.style.display = allowed.includes(role) ? "" : "none";
    } else { el.style.display = ""; }
  });
  const activeNav = document.querySelector(".nav-item.active");
  if (activeNav && activeNav.style.display === "none") {
    document.querySelector(".nav-item[data-view='dashboard']").click();
  }
}

renderAccount();

function renderAccount() {
  const roleNames = { owner: "老板/管理员", sales: "业务运营专员", dispatcher: "招聘专员", service: "客服人员" };
  const label = account ? `${account.company || account.name}｜${roleNames[account.role] || account.role}` : "未登录";
  els.accountBadge.textContent = label;
  els.accountStatus.textContent = account ? `当前登录：${label}` : "当前未登录";
  // 显示/隐藏个人资料和修改密码面板
  if (els.profilePanel) {
    els.profilePanel.style.display = account ? "" : "none";
  }
  if (account && els.profileForm) {
    const nameInput = els.profileForm.querySelector("[name=name]");
    const phoneInput = els.profileForm.querySelector("[name=phone]");
    if (nameInput) nameInput.value = account.name || "";
    if (phoneInput) phoneInput.value = account.phone || "";
  }
  document.querySelectorAll("[data-write]").forEach(item => {
    item.disabled = !account;
    item.title = account ? "" : "请先登录账号";
  });
  renderPermissions();
  renderApplicantLink();
}

// ── 求职者自助登记链接 ────────────────────────────
function renderApplicantLink() {
  const applicantLink = document.querySelector(".link-button[href^='applicant.html']");
  if (applicantLink) {
    if (account && account.companyKey) {
      applicantLink.href = `applicant.html?agency=${encodeURIComponent(account.companyKey)}`;
      applicantLink.removeAttribute("aria-disabled");
      applicantLink.style.pointerEvents = "";
      applicantLink.style.opacity = "";
      applicantLink.title = "把这个链接发给求职者";
    } else {
      applicantLink.href = "applicant.html";
      applicantLink.title = "登录后再分享给求职者";
      applicantLink.style.pointerEvents = "none";
      applicantLink.style.opacity = "0.5";
      applicantLink.setAttribute("aria-disabled", "true");
    }
  }
}

function renderFuzzyResults() {
  els.fuzzyCount.textContent = fuzzyItems.length ? `已识别 ${fuzzyItems.length} 条，导入前可修改` : "暂无识别结果";
  els.fuzzyResults.innerHTML = fuzzyItems.map((item, index) => `
    <article class="item fuzzy-card" data-fuzzy-index="${index}">
      <div class="item-top"><strong>识别结果 ${index + 1}</strong>${tag(`可信度 ${item.confidence || 70}%`)}</div>
      ${fuzzyKind === "worker" ? workerFuzzyFields(item) : demandFuzzyFields(item)}
    </article>
  `).join("") || `<p class="item-meta">粘贴文字或上传文本后，点击自动识别。</p>`;
}

function demandFuzzyFields(item) {
  return `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <label>企业名称<input data-field="company" value="${escapeAttr(item.company)}"></label>
        <label>企业产品<input data-field="product" value="${escapeAttr(item.product || '')}"></label>
        <label>岗位名称<input data-field="role" value="${escapeAttr(item.role)}"></label>
        <label>需求人数<input data-field="headcount" type="number" min="1" value="${Number(item.headcount) || 20}"></label>
        <label>证件需要与否<input data-field="needId" value="${escapeAttr(item.needId || '')}"></label>
        <label>工作地点<input data-field="location" value="${escapeAttr(item.location)}"></label>
        <label>月薪<input data-field="salary" value="${escapeAttr(item.salary)}"></label>
        <label>年龄要求<input data-field="age" value="${escapeAttr(item.age)}"></label>
        <label>性别要求<input data-field="genderRequired" value="${escapeAttr(item.genderRequired || '')}"></label>
        <label>是否倒班<input data-field="hasShifts" value="${escapeAttr(item.hasShifts || '')}"></label>
        <label>有无吃<input data-field="hasMeal" value="${escapeAttr(item.hasMeal || '')}"></label>
        <label>有无住<input data-field="hasDorm" value="${escapeAttr(item.hasDorm || '')}"></label>
        <label>是否需要岗位经验<input data-field="needExperience" value="${escapeAttr(item.needExperience || '')}"></label>
        <label>类型<select data-field="type">${["长期工", "短期工", "日结工", "季节工"].map(type => `<option ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
        <label>开始日期<input data-field="start" type="date" value="${escapeAttr(item.start)}"></label>
        <label>结束日期<input data-field="end" type="date" value="${escapeAttr(item.end)}"></label>
      </div>
      <label>其他用工要求/备注<textarea data-field="notes">${escapeHtml(item.notes || "")}</textarea></label>
  `;
}

function workerFuzzyFields(item) {
  return `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <label>姓名<input data-field="name" value="${escapeAttr(item.name)}"></label>
      <label>联系方式<input data-field="phone" value="${escapeAttr(item.phone)}"></label>
      <label>性别<select data-field="gender"><option value="">未确认</option><option ${item.gender === "男" ? "selected" : ""}>男</option><option ${item.gender === "女" ? "selected" : ""}>女</option></select></label>
      <label>年龄<input data-field="age" value="${escapeAttr(item.age)}"></label>
      <label>学历<input data-field="education" value="${escapeAttr(item.education || '')}"></label>
      <label>报名日期<input data-field="registrationDate" value="${escapeAttr(item.registrationDate || '')}"></label>
      <label>面试日期<input data-field="interviewDate" value="${escapeAttr(item.interviewDate || '')}"></label>
      <label>希望到岗日期<input data-field="desiredStartDate" value="${escapeAttr(item.desiredStartDate || '')}"></label>
      <label>上份工作岗位<input data-field="previousJob" value="${escapeAttr(item.previousJob || '')}"></label>
      <label>希望工作单位<input data-field="desiredCompany" value="${escapeAttr(item.desiredCompany || '')}"></label>
      <label>希望工作岗位<input data-field="expectedRole" value="${escapeAttr(item.expectedRole)}"></label>
      <label>希望月薪<input data-field="salary" value="${escapeAttr(item.salary)}"></label>
      <label>希望工作区域<input data-field="desiredArea" value="${escapeAttr(item.desiredArea || '')}"></label>
      <label>是否接受倒班<select data-field="acceptShifts"><option value="">未确认</option><option ${item.acceptShifts === "是" ? "selected" : ""}>是</option><option ${item.acceptShifts === "否" ? "selected" : ""}>否</option></select></label>
      <label>是否接受住宿<select data-field="acceptDorm"><option value="">未确认</option><option ${item.acceptDorm === "是" ? "selected" : ""}>是</option><option ${item.acceptDorm === "否" ? "selected" : ""}>否</option></select></label>
      <label>是否接受社保<select data-field="acceptSocialInsurance"><option value="">未确认</option><option ${item.acceptSocialInsurance === "是" ? "selected" : ""}>是</option><option ${item.acceptSocialInsurance === "否" ? "selected" : ""}>否</option></select></label>
      <label>地区<input data-field="location" value="${escapeAttr(item.location)}"></label>
      <label>可到岗<input data-field="available" value="${escapeAttr(item.available)}"></label>
      <label>周期<input data-field="period" value="${escapeAttr(item.period)}"></label>
    </div>
    <label>其他个人希望<textarea data-field="otherWishes">${escapeHtml(item.otherWishes || "")}</textarea></label>
    <label>标签<textarea data-field="tags">${escapeHtml((item.tags || []).join(", "))}</textarea></label>
    <label>原文/备注<textarea data-field="note">${escapeHtml(item.note || "")}</textarea></label>
  `;
}

function setFuzzyStatus(message, isError = false) {
  els.fuzzyStatus.textContent = message;
  els.fuzzyStatus.style.background = isError ? "#ffe9e9" : "#e5f5ec";
  els.fuzzyStatus.style.color = isError ? "#8a2424" : "#0d5b38";
  els.fuzzyStatus.classList.add("show");
}

function renderSidebar() {
  if (!account) {
    els.sideSummary.textContent = "当前为演示模式，展示的是模拟数据；登录后加载企业私有知识库和真实业务数据。";
    return;
  }
  if (!data.demands.length) {
    els.sideSummary.textContent = "暂无企业用工数据。";
    return;
  }
  const totalGap = data.demands.reduce((sum, item) => sum + remaining(item), 0);
  const next = [...data.demands].sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  els.sideSummary.textContent = `${data.demands.length} 条企业需求，当前总缺口 ${totalGap} 人。最近启动：${next.company} ${next.role}。`;
}

function renderDashboard() {
  const totalNeed = data.demands.reduce((sum, item) => sum + Number(item.headcount), 0);
  const totalSigned = data.demands.reduce((sum, item) => sum + Number(item.signed || 0), 0);
  const totalGap = totalNeed - totalSigned;
  const activeCompanies = new Set(data.demands.map(item => item.company)).size;

  els.metrics.innerHTML = [
    ["企业需求", `${data.demands.length} 条`],
    ["全年计划人数", `${totalNeed} 人`],
    ["当前缺口", `${totalGap} 人`],
    ["求职者库", `${data.workers.length} 人`]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");

  const urgent = [...data.demands]
    .filter(item => remaining(item) > 0)
    .sort((a, b) => daysUntil(a.start) - daysUntil(b.start) || remaining(b) - remaining(a))
    .slice(0, 5);

  els.urgentList.innerHTML = urgent.map(item => `
    <article class="item">
      <div class="item-top"><strong>${h(item.company)} · ${h(item.role)}</strong>${tag(`缺 ${remaining(item)} 人`, remaining(item) > 60 ? "danger" : "warn")}</div>
      <div class="item-meta"><span>${h(formatDateRange(item))}</span><span>${h(item.location)}</span><span>${h(item.salary)}</span></div>
    </article>
  `).join("") || `<p class="item-meta">暂无紧急缺口</p>`;

  const tasks = urgent.slice(0, 4).map(item => {
    const matches = rankWorkers(item).slice(0, 3);
    return `
      <article class="item">
        <div class="item-top"><strong>${h(item.company)} ${h(item.role)}</strong>${tag("预招募")}</div>
        <div class="item-meta"><span>建议联系：${matches.map(match => h(match.worker.name)).join("、") || "暂无合适人选"}</span></div>
      </article>
    `;
  });
  tasks.push(`<article class="item"><div class="item-top"><strong>本地知识库</strong>${tag(`${activeCompanies} 家企业`)}</div><div class="item-meta"><span>企业规则、岗位排期和推荐解释已进入后台数据库。</span></div></article>`);
  els.taskList.innerHTML = tasks.join("");
}

function renderCalendar() {
  const selectedBeforeRender = Number(els.yearSelect.value || currentYear);
  const years = [...new Set(data.demands.map(item => new Date(item.start).getFullYear()))].sort();
  if (!years.includes(currentYear)) years.unshift(currentYear);
  els.yearSelect.innerHTML = years.map(year => `<option ${year === selectedBeforeRender ? "selected" : ""}>${year}</option>`).join("");

  const companies = ["all", ...new Set(data.demands.map(item => item.company))];
  const currentCompany = els.companyFilter.value || "all";
  els.companyFilter.innerHTML = companies.map(company => `<option value="${escapeAttr(company)}">${company === "all" ? "全部企业" : h(company)}</option>`).join("");
  els.companyFilter.value = companies.includes(currentCompany) ? currentCompany : "all";

  const selectedYear = Number(els.yearSelect.value || currentYear);
  const selectedCompany = els.companyFilter.value || "all";
  const selectedType = els.typeFilter.value || "all";
  const filtered = data.demands.filter(item => {
    const yearMatches = new Date(item.start).getFullYear() === selectedYear;
    const companyMatches = selectedCompany === "all" || item.company === selectedCompany;
    const typeMatches = selectedType === "all" || item.type === selectedType;
    return yearMatches && companyMatches && typeMatches;
  });

  els.calendarGrid.innerHTML = Array.from({ length: 12 }, (_, month) => {
    const monthDemands = filtered.filter(item => monthOf(item.start) === month);
    const monthGap = monthDemands.reduce((sum, item) => sum + remaining(item), 0);
    return `
      <section class="month-card">
        <div class="month-title"><span>${month + 1}月</span><span>${monthGap ? `缺 ${monthGap}` : "无排期"}</span></div>
        ${monthDemands.map(item => `
          <div class="mini-demand">
            <strong>${h(item.company)} · ${h(item.role)}</strong>
            <span>${h(item.type)}｜${h(formatDateRange(item))}｜缺 ${remaining(item)} 人</span>
          </div>
        `).join("") || `<p class="item-meta">暂无企业用工计划</p>`}
      </section>
    `;
  }).join("");
}

function renderDemandTable() {
  const keyword = els.demandSearch.value.trim().toLowerCase();
  const rows = data.demands.filter(item => {
    const text = `${item.company} ${item.role} ${item.location} ${item.type} ${item.notes}`.toLowerCase();
    return text.includes(keyword);
  });
  els.demandTable.innerHTML = rows.map(item => {
    const matches = rankWorkers(item).slice(0, 2);
    return `
      <tr>
        <td><strong>${h(item.company)}</strong><br><span class="item-meta">${h(item.location)}</span></td>
        <td>${h(item.role)}<br>${tag(item.type)}</td>
        <td>${h(formatDateRange(item))}</td>
        <td>${h(item.headcount)} 人</td>
        <td>${tag(`${remaining(item)} 人`, remaining(item) > 50 ? "danger" : "warn")}</td>
        <td>${h(item.salary)}</td>
        <td>${remaining(item) === 0 ? tag("已满员") : tag("匹配中", "warn")}</td>
        <td>${matches.map(match => `${h(match.worker.name)} ${match.score}分`).join("<br>") || "暂无"}</td>
        <td><button class="ghost" onclick="showAssignDemand(${item.id})" data-write style="font-size:12px" data-perm="pipeline.assign">分配求职者</button></td>
      </tr>
    `;
  }).join("");
}

function renderWorkers() {
  const keyword = els.workerSearch.value.trim().toLowerCase();
  const workers = data.workers.filter(worker => {
    const text = `${worker.name} ${worker.location} ${worker.available} ${worker.period} ${worker.salary} ${worker.tags.join(" ")}`.toLowerCase();
    return text.includes(keyword);
  });
  els.workerGrid.innerHTML = workers.map(worker => {
    const best = bestDemandFor(worker);
    return `
      <article class="worker-card">
        <h3>${h(worker.name)}</h3>
        <p class="item-meta">${h(worker.location)}｜${h(worker.available)}｜${h(worker.period)}</p>
        <p class="item-meta">${[worker.gender, worker.age ? `${worker.age}岁` : "", worker.phone, worker.education].filter(Boolean).map(h).join("｜") || "基础信息待补充"}</p>
        ${worker.expectedRole ? `<p>期望岗位：${h(worker.expectedRole)}${worker.desiredCompany ? ` @ ${h(worker.desiredCompany)}` : ""}</p>` : ""}
        <p>${h(worker.salary || "薪资待确认")}｜稳定性 ${Number(worker.score) || 0} 分${worker.desiredArea ? `｜${h(worker.desiredArea)}` : ""}</p>
        ${worker.previousJob ? `<p class="item-meta">上份工作：${h(worker.previousJob)}</p>` : ""}
        ${worker.note ? `<p class="item-meta">备注：${h(worker.note)}</p>` : ""}
        <div class="tags">${worker.tags.map(item => tag(item)).join("")}${worker.acceptShifts ? tag(worker.acceptShifts === "是" ? "可倒班" : "不倒班") : ""}${worker.acceptDorm ? tag(worker.acceptDorm === "是" ? "要住宿" : "不住宿") : ""}</div>
        <div class="item" style="margin-top:12px">
          <strong>推荐岗位</strong>
          <span class="item-meta">${best ? `${h(best.demand.company)} · ${h(best.demand.role)}（${best.score}分）` : "暂无合适岗位"}</span>
        </div>
        <div class="public-actions" style="margin-top:8px">
          <button class="ghost" onclick="showAssignWorker(${worker.id})" data-write data-perm="pipeline.assign">分配岗位</button>
        </div>
      </article>
    `;
  }).join(""); // end workerGrid
}

function renderKnowledge() {
  const byType = groupBy(data.demands, "type");
  const byCompany = groupBy(data.demands, "company");
  const highGap = [...data.demands].sort((a, b) => remaining(b) - remaining(a)).slice(0, 3);
  els.knowledgeSummary.innerHTML = `
    <div class="knowledge-block"><strong>企业知识</strong>${Object.keys(byCompany).map(company => `${h(company)}：${byCompany[company].length} 条需求`).join("<br>")}</div>
    <div class="knowledge-block"><strong>用工类型</strong>${Object.keys(byType).map(type => `${h(type)}：${byType[type].length} 条`).join("<br>")}</div>
    <div class="knowledge-block"><strong>重点缺口</strong>${highGap.map(item => `${h(item.company)}${h(item.role)} 缺 ${remaining(item)} 人`).join("<br>")}</div>
    <div class="knowledge-block"><strong>求职者标签</strong>${topTags().map(([name, count]) => `${h(name)}：${count} 人`).join("<br>")}</div>
  `;
}

function renderKnowledgeBase() {
  const knowledge = data.knowledge || [];
  const insights = data.insights || {};
  const keyword = els.knowledgeSearch?.value.trim().toLowerCase() || "";
  const filtered = knowledge.filter(item => {
    const text = `${item.category} ${item.title} ${item.summary} ${item.source} ${item.tags.join(" ")}`.toLowerCase();
    return text.includes(keyword);
  });
  const categories = new Set(knowledge.map(item => item.category)).size;
  els.knowledgeMetrics.innerHTML = [
    ["知识条目", `${knowledge.length} 条`],
    ["知识分类", `${categories} 类`],
    ["自动登记", `${insights.selfRegisteredCount || 0} 人`],
    ["当前总缺口", `${insights.totalGap || 0} 人`]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");

  els.knowledgeList.innerHTML = filtered.map(item => `
    <article class="item">
      <div class="item-top">
        <label class="check-row"><input type="checkbox" class="knowledge-check" value="${Number(item.id) || 0}"> <strong>${h(item.title)}</strong></label>
        ${tag(item.category)}
      </div>
      <p>${h(item.summary)}</p>
      <div class="tags">${item.tags.slice(0, 8).map(tagName => tag(tagName)).join("")}</div>
      <div class="item-meta"><span>来源：${h(item.source || "系统沉淀")}</span><span>可信度：${Number(item.confidence) || 0}%</span><span>${h(item.entityType || "manual")}</span></div>
      <div class="public-actions">
        <button class="ghost knowledge-edit" data-id="${Number(item.id) || 0}" data-write>修改</button>
        <button class="ghost knowledge-delete" data-id="${Number(item.id) || 0}" data-write>删除</button>
      </div>
    </article>
  `).join("") || `<p class="item-meta">暂无匹配的知识条目</p>`;
  renderAccount();

  const block = (title, items, emptyText) => `
    <div class="knowledge-block">
      <strong>${h(title)}</strong>
      ${items?.length ? items.map(item => `${h(item.title)}${item.value ? `：${Number(item.value)}人` : ""}<br><span class="item-meta">${h(item.note || "")}</span>`).join("<br>") : h(emptyText)}
    </div>
  `;
  els.insightList.innerHTML = [
    block("重点缺口岗位", insights.highGap, "暂无缺口数据"),
    block("可周结岗位", insights.weeklyJobs, "暂无周结岗位"),
    block("不用体检岗位", insights.noExamJobs, "暂无不用体检岗位"),
    block("可接受夜班人选", insights.nightWorkers, "暂无夜班标签人选")
  ].join("");
}

function renderChat() {
  els.chatLog.innerHTML = data.chat.map(item => `<div class="bubble ${item.role === "user" ? "user" : ""}">${escapeHtml(item.text)}</div>`).join("");
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] ||= [];
    acc[item[key]].push(item);
    return acc;
  }, {});
}

function topTags() {
  const counts = {};
  data.workers.flatMap(worker => worker.tags).forEach(item => {
    counts[item] = (counts[item] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function rankWorkers(demand) {
  return data.workers.map(worker => {
    let score = Math.round(Number(worker.score || 70) * 0.45);
    const reasons = [];
    const demandText = `${demand.company} ${demand.role} ${demand.type} ${demand.location} ${demand.notes}`.toLowerCase();
    const workerText = `${worker.location} ${worker.available} ${worker.period} ${worker.tags.join(" ")}`.toLowerCase();

    if (demandText.includes(worker.location.toLowerCase()) || workerText.includes(demand.location.slice(0, 2).toLowerCase())) {
      score += 14;
      reasons.push("地区接近");
    }
    if (worker.tags.some(item => demandText.includes(item.slice(0, 2).toLowerCase()))) {
      score += 16;
      reasons.push("岗位经验匹配");
    }
    if (demand.type.includes("短期") && (worker.period.includes("暑假") || worker.period.includes("7-15") || worker.tags.includes("短期工"))) {
      score += 14;
      reasons.push("可做短期");
    }
    if (demand.type.includes("长期") && worker.period.includes("长期")) {
      score += 14;
      reasons.push("适合长期稳定");
    }
    if (demand.notes.includes("夜班") && worker.tags.some(item => item.includes("夜班"))) {
      score += 12;
      reasons.push("接受夜班");
    }
    if (demand.notes.includes("住宿") && worker.tags.some(item => item.includes("住宿"))) {
      score += 8;
      reasons.push("住宿需求一致");
    }
    for (const keyword of ["包装", "分拣", "质检", "注塑", "物流", "抛光", "坐班"]) {
      if ((demand.role + demand.notes).includes(keyword) && worker.tags.some(item => item.includes(keyword))) {
        score += 10;
        reasons.push(`${keyword}匹配`);
        break;
      }
    }

    return { worker, score: Math.min(score, 100), reasons };
  }).sort((a, b) => b.score - a.score);
}

function bestDemandFor(worker) {
  const ranked = data.demands.map(demand => {
    const found = rankWorkers(demand).find(item => item.worker.id === worker.id);
    return { demand, score: found.score, reasons: found.reasons };
  }).sort((a, b) => b.score - a.score);
  return ranked[0];
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

// 简短别名，便于在模板字符串里大量使用
function h(text) { return escapeHtml(text); }

function escapeAttr(text) {
  return escapeHtml(String(text || ""));
}

function collectFuzzyItemsFromDom() {
  return [...document.querySelectorAll("[data-fuzzy-index]")].map(card => {
    const item = {};
    card.querySelectorAll("[data-field]").forEach(field => {
      item[field.dataset.field] = field.value.trim();
    });
    if (fuzzyKind === "worker") {
      item.score = 75;
      item.tags = (item.tags || "").split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
      item.source = "求职者模糊采集";
    } else {
      item.headcount = Number(item.headcount || 20);
      item.signed = 0;
    }
    return item;
  });
}

function selectedKnowledgeIds() {
  return [...document.querySelectorAll(".knowledge-check:checked")].map(item => Number(item.value));
}

function openKnowledgeModal(item = null) {
  els.knowledgeForm.reset();
  els.knowledgeForm.elements.id.value = item?.id || "";
  els.knowledgeForm.elements.category.value = item?.category || "业务知识";
  els.knowledgeForm.elements.source.value = item?.source || "人工维护";
  els.knowledgeForm.elements.confidence.value = item?.confidence || 80;
  els.knowledgeForm.elements.tags.value = item?.tags?.join(", ") || "";
  els.knowledgeForm.elements.title.value = item?.title || "";
  els.knowledgeForm.elements.summary.value = item?.summary || "";
  document.querySelector("#knowledgeModal").showModal();
}

function knowledgePayloadFromForm(form) {
  const formData = new FormData(form);
  return {
    id: formData.get("id"),
    category: formData.get("category"),
    source: formData.get("source"),
    confidence: formData.get("confidence"),
    tags: formData.get("tags"),
    title: formData.get("title"),
    summary: formData.get("summary")
  };
}

function formDataToDemand(formData) {
  return {
    company: formData.get("company").trim(),
    role: formData.get("role").trim(),
    type: formData.get("type"),
    location: formData.get("location").trim(),
    start: formData.get("start"),
    end: formData.get("end"),
    headcount: Number(formData.get("headcount")),
    signed: Number(formData.get("signed")),
    salary: formData.get("salary").trim(),
    age: formData.get("age").trim(),
    notes: formData.get("notes").trim()
  };
}

function formDataToWorker(formData) {
  return {
    name: formData.get("name").trim(),
    phone: formData.get("phone")?.trim() || "",
    gender: formData.get("gender") || "",
    age: formData.get("age") || "",
    location: formData.get("location").trim(),
    available: formData.get("available").trim(),
    period: formData.get("period"),
    expectedRole: formData.get("expectedRole")?.trim() || "",
    salary: formData.get("salary").trim(),
    score: Number(formData.get("score")),
    tags: formData.get("tags").split(/[,，]/).map(item => item.trim()).filter(Boolean),
    note: formData.get("note")?.trim() || "",
    source: "业务运营专员录入"
  };
}

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.view}`).classList.add("active");
    els.pageTitle.textContent = button.textContent;
  });
});

document.querySelectorAll("[data-open-modal]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.openModal}`).showModal();
  });
});

document.querySelectorAll("[data-close-modal]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.closeModal}`).close();
  });
});

document.querySelector("#demandForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = await api("/api/demands", {
    method: "POST",
    body: JSON.stringify(formDataToDemand(new FormData(event.currentTarget)))
  });
  data = payload.data;
  event.currentTarget.reset();
  document.querySelector("#demandModal").close();
  renderAll();
});

document.querySelector("#workerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = await api("/api/workers", {
    method: "POST",
    body: JSON.stringify(formDataToWorker(new FormData(event.currentTarget)))
  });
  data = payload.data;
  event.currentTarget.reset();
  document.querySelector("#workerModal").close();
  renderAll();
});

els.yearSelect.addEventListener("change", renderCalendar);
els.companyFilter.addEventListener("change", renderCalendar);
els.typeFilter.addEventListener("change", renderCalendar);
els.demandSearch.addEventListener("input", renderDemandTable);
els.workerSearch.addEventListener("input", renderWorkers);
els.knowledgeSearch.addEventListener("input", renderKnowledgeBase);

document.querySelector("#parseFuzzy").addEventListener("click", async () => {
  const text = els.fuzzyText.value.trim();
  const file = els.fuzzyFile.files?.[0];
  if (!text && !file) {
    setFuzzyStatus("请先粘贴文字，或上传 xlsx/docx/csv/txt 等文件后再识别。", true);
    return;
  }
  const button = document.querySelector("#parseFuzzy");
  button.disabled = true;
  button.textContent = "识别中...";
  setFuzzyStatus("正在识别，请稍等。");
  try {
    let payload;
    if (file) {
      const formData = new FormData();
      formData.append("kind", fuzzyKind);
      formData.append("file", file);
      payload = await uploadApi("/api/fuzzy/file", formData);
      if (payload.text) els.fuzzyText.value = payload.text;
    } else {
      payload = await api("/api/fuzzy/parse", {
        method: "POST",
        body: JSON.stringify({ text, kind: fuzzyKind })
      });
    }
    fuzzyItems = payload.items || [];
    renderFuzzyResults();
    const kindLabel = fuzzyKind === "worker" ? "求职者信息" : "企业需求";
    let statusMsg = fuzzyItems.length
      ? `识别完成，共 ${fuzzyItems.length} 条`
      : `没有识别到可导入的${kindLabel}。`;
    if (payload.truncated) {
      statusMsg += `（文件共 ${payload.totalRows} 条，仅显示前 ${payload.returnedCount} 条。导入后再上传后续部分即可）`;
    } else if (payload.totalRows && payload.totalRows > fuzzyItems.length) {
      statusMsg += `（文件共 ${payload.totalRows} 行，其中 ${fuzzyItems.length} 行有数据）`;
    } else {
      statusMsg += `，请检查后导入。`;
    }
    setFuzzyStatus(statusMsg, !fuzzyItems.length);
  } catch (error) {
    setFuzzyStatus(`识别失败：${error.message}。如果刚更新过代码，请确认服务器已经 git pull 并重启。`, true);
  } finally {
    button.disabled = false;
    button.textContent = "自动识别";
  }
});

document.querySelector("#importFuzzy").addEventListener("click", async () => {
  const items = collectFuzzyItemsFromDom();
  if (!items.length) {
    setFuzzyStatus("暂无可导入内容，请先自动识别。", true);
    return;
  }
  const button = document.querySelector("#importFuzzy");
  const kindLabel = fuzzyKind === "worker" ? "求职者" : "企业需求";
  button.disabled = true;
  button.textContent = "导入中...";
  try {
    const payload = await api("/api/fuzzy/import", {
      method: "POST",
      body: JSON.stringify({ items, kind: fuzzyKind })
    });
    data = payload.data;
    fuzzyItems = [];
    els.fuzzyText.value = "";
    renderFuzzyResults();
    renderAll();
    setFuzzyStatus(`已导入${kindLabel}，并同步进入${fuzzyKind === "worker" ? "求职者库" : "全年日历"}和私有知识库。`);
  } catch (error) {
    setFuzzyStatus(`导入失败：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = `确认导入${kindLabel}`;
  }
});

function refreshImportButtonText() {
  const importBtn = document.querySelector("#importFuzzy");
  if (importBtn) importBtn.textContent = fuzzyKind === "worker" ? "确认导入求职者" : "确认导入企业需求";
}

document.querySelector("#clearFuzzy").addEventListener("click", () => {
  fuzzyItems = [];
  els.fuzzyText.value = "";
  els.fuzzyFile.value = "";
  renderFuzzyResults();
  setFuzzyStatus("已清空。");
});

els.fuzzyFile.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const name = file.name.toLowerCase();
  if (/\.(txt|md|csv|json)$/.test(name)) {
    els.fuzzyText.value = await file.text();
    setFuzzyStatus("文本文件已读取，可点击自动识别。");
  } else {
    setFuzzyStatus("文件已选择，将在点击自动识别时由后台解析。");
  }
});

document.querySelectorAll("[data-fuzzy-kind]").forEach(button => {
  button.addEventListener("click", () => {
    fuzzyKind = button.dataset.fuzzyKind;
    document.querySelectorAll("[data-fuzzy-kind]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    fuzzyItems = [];
    renderFuzzyResults();
    refreshImportButtonText();
    setFuzzyStatus(fuzzyKind === "worker" ? "已切换到求职者信息采集。" : "已切换到企业用工信息采集。");
  });
});

// ── 短信验证码通用函数 ──────────────────────────
let smsCountdown = null;
function startSmsCountdown(btn, seconds = 60) {
  btn.disabled = true;
  let remaining = seconds;
  const orig = btn.textContent;
  btn.textContent = `${remaining}s`;
  if (smsCountdown) clearInterval(smsCountdown);
  smsCountdown = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(smsCountdown);
      btn.disabled = false;
      btn.textContent = orig;
    } else {
      btn.textContent = `${remaining}s`;
    }
  }, 1000);
}
async function handleSendCode(phoneInput, btn) {
  const phone = phoneInput.value.trim();
  if (!/^1\d{10}$/.test(phone)) {
    showAccountMessage("请输入正确的11位手机号", true);
    phoneInput.focus();
    return;
  }
  try {
    btn.disabled = true;
    await api("/api/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ phone })
    });
    showAccountMessage(`验证码已发送至 ${phone}`);
    startSmsCountdown(btn);
  } catch (error) {
    btn.disabled = false;
    showAccountMessage(error.message, true);
  }
}
function showAccountMessage(message, isError = false) {
  els.accountMessage.textContent = message;
  els.accountMessage.style.background = isError ? "#ffe9e9" : "#e5f5ec";
  els.accountMessage.style.color = isError ? "#8a2424" : "#0d5b38";
  els.accountMessage.classList.add("show");
}

// ── 注册 ────────────────────────────────────────
document.querySelector("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());
    const payload = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data)
    });
    account = payload.account;
    localStorage.setItem("labor-account", JSON.stringify(account));
    data = payload.data;
    renderAccount();
    renderAll();
    showAccountMessage("注册成功，已自动登录。");
  } catch (error) {
    showAccountMessage(error.message, true);
  }
});

// ── 角色选择 → 显示/隐藏老板验证码 ──────────────
document.querySelector("#regRole")?.addEventListener("change", event => {
  const field = document.querySelector("#ownerCodeField");
  if (field) {
    field.style.display = event.target.value === "owner" ? "" : "none";
    const input = field.querySelector("input");
    if (input) input.required = event.target.value === "owner";
  }
});

// ── 发送注册验证码 ──────────────────────────────
els.sendRegCode.addEventListener("click", () => {
  const phoneInput = document.querySelector("#registerForm [name=phone]");
  handleSendCode(phoneInput, els.sendRegCode);
});

// ── 登录 ────────────────────────────────────────
document.querySelector("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    account = payload.account;
    localStorage.setItem("labor-account", JSON.stringify(account));
    data = payload.data;
    renderAccount();
    renderAll();
    showAccountMessage("登录成功。");
  } catch (error) {
    showAccountMessage(error.message, true);
  }
});

// ── 退出 ────────────────────────────────────────
document.querySelector("#logoutAccount").addEventListener("click", async () => {
  account = null;
  localStorage.removeItem("labor-account");
  data = { demands: [], workers: [], chat: [] };
  renderAccount();
  showAccountMessage("已退出登录。");
  await loadData();
});

// ── 忘记密码（打开弹窗） ────────────────────────
els.showResetPwd.addEventListener("click", () => {
  document.querySelector("#resetPwdModal").showModal();
});

// ── 发送重置验证码 ──────────────────────────────
els.sendResetCode.addEventListener("click", () => {
  const phoneInput = document.querySelector("#resetPwdForm [name=phone]");
  handleSendCode(phoneInput, els.sendResetCode);
});

// ── 重置密码 ────────────────────────────────────
els.resetPwdForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = await api("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    els.resetPwdMessage.textContent = payload.msg;
    els.resetPwdMessage.style.background = "#e5f5ec";
    els.resetPwdMessage.style.color = "#0d5b38";
    els.resetPwdMessage.classList.add("show");
    setTimeout(() => document.querySelector("#resetPwdModal").close(), 2000);
  } catch (error) {
    els.resetPwdMessage.textContent = error.message;
    els.resetPwdMessage.style.background = "#ffe9e9";
    els.resetPwdMessage.style.color = "#8a2424";
    els.resetPwdMessage.classList.add("show");
  }
});

// ── 修改密码 ────────────────────────────────────
els.changePwdForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    els.changePwdMessage.textContent = payload.msg;
    els.changePwdMessage.style.background = "#e5f5ec";
    els.changePwdMessage.style.color = "#0d5b38";
    els.changePwdMessage.classList.add("show");
    event.currentTarget.reset();
  } catch (error) {
    els.changePwdMessage.textContent = error.message;
    els.changePwdMessage.style.background = "#ffe9e9";
    els.changePwdMessage.style.color = "#8a2424";
    els.changePwdMessage.classList.add("show");
  }
});

// ── 更新个人资料 ────────────────────────────────
els.profileForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = await api("/api/profile/update", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    account = payload.account;
    localStorage.setItem("labor-account", JSON.stringify(account));
    renderAccount();
    els.profileMessage.textContent = "资料更新成功";
    els.profileMessage.style.background = "#e5f5ec";
    els.profileMessage.style.color = "#0d5b38";
    els.profileMessage.classList.add("show");
  } catch (error) {
    els.profileMessage.textContent = error.message;
    els.profileMessage.style.background = "#ffe9e9";
    els.profileMessage.style.color = "#8a2424";
    els.profileMessage.classList.add("show");
  }
});

els.chatForm.addEventListener("submit", async event => {
  event.preventDefault();
  const question = els.chatInput.value.trim();
  if (!question) return;
  els.chatInput.value = "";
  const payload = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ question })
  });
  data = payload.data;
  renderAll();
});

document.querySelectorAll("[data-question]").forEach(button => {
  button.addEventListener("click", () => {
    els.chatInput.value = button.dataset.question;
    els.chatForm.requestSubmit();
  });
});

document.querySelector("#resetDemo").addEventListener("click", async () => {
  const payload = await api("/api/reset", { method: "POST", body: "{}" });
  data = payload.data;
  renderAll();
});

document.querySelector("#rebuildKnowledge").addEventListener("click", async () => {
  const payload = await api("/api/knowledge/rebuild", { method: "POST", body: "{}" });
  data = payload.data;
  renderAll();
});

document.querySelector("#newKnowledge").addEventListener("click", () => openKnowledgeModal());

els.knowledgeList.addEventListener("click", async event => {
  const editButton = event.target.closest(".knowledge-edit");
  const deleteButton = event.target.closest(".knowledge-delete");
  if (editButton) {
    const item = (data.knowledge || []).find(entry => entry.id === Number(editButton.dataset.id));
    openKnowledgeModal(item);
  }
  if (deleteButton) {
    const payload = await api("/api/knowledge/delete", {
      method: "POST",
      body: JSON.stringify({ id: Number(deleteButton.dataset.id) })
    });
    data = payload.data;
    renderAll();
  }
});

els.knowledgeForm.addEventListener("submit", async event => {
  event.preventDefault();
  const payload = await api("/api/knowledge/save", {
    method: "POST",
    body: JSON.stringify(knowledgePayloadFromForm(event.currentTarget))
  });
  data = payload.data;
  document.querySelector("#knowledgeModal").close();
  renderAll();
});

document.querySelector("#batchDeleteKnowledge").addEventListener("click", async () => {
  const ids = selectedKnowledgeIds();
  if (!ids.length) return;
  const payload = await api("/api/knowledge/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
  data = payload.data;
  renderAll();
});

document.querySelector("#batchEditKnowledge").addEventListener("click", () => {
  if (!selectedKnowledgeIds().length) return;
  els.knowledgeBatchForm.reset();
  document.querySelector("#knowledgeBatchModal").showModal();
});

els.knowledgeBatchForm.addEventListener("submit", async event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
  const payload = await api("/api/knowledge/batch-update", {
    method: "POST",
    body: JSON.stringify({ ids: selectedKnowledgeIds(), fields })
  });
  data = payload.data;
  document.querySelector("#knowledgeBatchModal").close();
  renderAll();
});

loadData().catch(error => {
  console.error('[数据加载]', error);
  els.sideSummary.textContent = "后台服务未连接，请先启动 server.py。";
  els.metrics.innerHTML = `<article class="metric"><span>系统状态</span><strong>未连接</strong></article>`;
  // 确保页面不白屏：总览视图至少显示指标
  if (!els.metrics.querySelector('strong')) {
    els.metrics.innerHTML += '<article class="metric"><span>提示</span><strong>请登录或刷新页面重试</strong></article>';
  }
});

// ── 招聘流程 / Pipeline ────────────────────────────
const STATUS_NAMES = {
  assigned: "已分配", contacted: "已联系", interviewed: "已面试",
  onboarded: "已到岗", stationed: "在岗", departed: "已离职"
};
const STATUS_TRANSITIONS = {
  assigned: ["contacted"],
  contacted: ["interviewed"],
  interviewed: ["onboarded"],
  onboarded: ["stationed"],
  stationed: ["departed"],
  departed: []
};
const STATUS_FLOW = ["assigned", "contacted", "interviewed", "onboarded", "stationed", "departed"];

let pipelineData = [];
let isKanban = false;

async function loadPipelines() {
  const statusFilter = document.querySelector("#pipelineStatusFilter")?.value || "";
  try {
    const url = `/api/pipeline/list?company_key=${encodeURIComponent(account?.companyKey || "")}` +
      (statusFilter ? `&status=${statusFilter}` : "");
    const resp = await api(url);
    if (resp.ok) {
      pipelineData = resp.pipelines || [];
      renderPipeline();
    }
  } catch (e) {
    console.error("加载pipeline失败:", e);
  }
}

function renderPipeline() {
  if (isKanban) {
    renderKanban();
  } else {
    renderPipelineTable();
  }
}

function renderPipelineTable() {
  const div = document.querySelector("#pipelineList");
  if (!div) return;
  if (!pipelineData.length) {
    div.innerHTML = '<p style="padding:20px;color:var(--muted);text-align:center">暂无招聘流程记录。在求职者库或企业需求页面中分配岗位后，记录将出现在这里。</p>';
    return;
  }
  let html = `<table class="data-table"><thead><tr>
    <th>求职者</th><th>企业/岗位</th><th>分配时间</th><th>当前状态</th><th>更新时间</th><th>操作</th>
  </tr></thead><tbody>`;
  pipelineData.forEach(p => {
    const statusLabel = STATUS_NAMES[p.status] || p.status;
    const nextStatuses = STATUS_TRANSITIONS[p.status] || [];
    const canGoBack = getPrevStatus(p.status);
    html += `<tr>
      <td><strong>${escapeHtml(p.worker_name)}</strong><br><small style="color:var(--muted)">${escapeHtml(p.worker_phone || '')}</small></td>
      <td><strong>${escapeHtml(p.demand_company)}</strong> — ${escapeHtml(p.demand_role)}<br><small style="color:var(--muted)">${escapeHtml(p.demand_salary || '')}</small></td>
      <td><small>${p.created_at?.slice(0,16) || '-'}</small></td>
      <td><span class="status-badge status-${p.status}">${statusLabel}</span></td>
      <td><small>${p.updated_at?.slice(0,16) || '-'}</small></td>
      <td class="pipeline-actions">
        ${hasRole('pipeline', 'advance') ? nextStatuses.map(s => `<button class="btn btn-primary" onclick="updatePipelineStatus(${p.id},'${s}')">→ ${STATUS_NAMES[s]}</button>`).join('') : ''}
        ${(hasRole('pipeline', 'revert') && canGoBack) ? `<button class="btn" onclick="updatePipelineStatus(${p.id},'${canGoBack}')">← 退回</button>` : ''}
        ${(hasRole('pipeline', 'revert') && p.status !== 'departed') ? `<button class="btn" onclick="updatePipelineStatus(${p.id},'departed')" style="color:var(--danger)">× 离职</button>` : ''}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  div.innerHTML = html;
}

function getPrevStatus(current) {
  const idx = STATUS_FLOW.indexOf(current);
  if (idx <= 0) return null;
  return STATUS_FLOW[idx - 1];
}

function renderKanban() {
  document.querySelector("#pipelineList").style.display = "none";
  document.querySelector("#pipelineKanban").style.display = "flex";
  STATUS_FLOW.forEach(status => {
    const container = document.querySelector(`#kanban-${status}`);
    if (!container) return;
    const items = pipelineData.filter(p => p.status === status);
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--muted);font-size:12px;text-align:center;padding:10px">暂无</p>';
      return;
    }
    container.innerHTML = items.map(p => {
      const nextStatuses = STATUS_TRANSITIONS[p.status] || [];
      const canGoBack = getPrevStatus(p.status);
      return `<div class="kanban-card">
        <div class="worker-name">${escapeHtml(p.worker_name)}</div>
        <div class="demand-info">
          ${escapeHtml(p.demand_company)} — ${escapeHtml(p.demand_role)}<br>
          ${escapeHtml(p.demand_salary || '')}<br>
          📞 ${escapeHtml(p.worker_phone || '')}
        </div>
        <div class="kanban-actions">
          ${hasRole('pipeline', 'advance') ? nextStatuses.map(s => `<button class="btn btn-primary" onclick="updatePipelineStatus(${p.id},'${s}')">→ ${STATUS_NAMES[s]}</button>`).join('') : ''}
          ${(hasRole('pipeline', 'revert') && canGoBack) ? `<button class="btn" onclick="updatePipelineStatus(${p.id},'${canGoBack}')">← 退回</button>` : ''}
          ${(hasRole('pipeline', 'revert') && p.status !== 'departed') ? `<button class="btn" onclick="updatePipelineStatus(${p.id},'departed')" style="color:var(--danger)">× 离职</button>` : ''}
        </div>
      </div>`;
    }).join('');
  });
}

function togglePipelineView() {
  isKanban = document.querySelector("#toggleKanban")?.checked || false;
  renderPipeline();
}

async function updatePipelineStatus(pipelineId, newStatus) {
  try {
    const resp = await api("/api/pipeline/status", {
      method: "POST",
      body: JSON.stringify({ pipeline_id: pipelineId, status: newStatus })
    });
    if (resp.ok) {
      loadPipelines();
    } else {
      alert(resp.error || "更新失败");
    }
  } catch (e) {
    alert("更新失败: " + e.message);
  }
}

async function assignWorkerToDemand(workerId, demandId) {
  try {
    const resp = await api("/api/pipeline/assign", {
      method: "POST",
      body: JSON.stringify({ worker_id: workerId, demand_id: demandId })
    });
    if (resp.ok) {
      document.querySelector("#assignModal")?.close();
      const worker = data.workers.find(w => w.id === workerId);
      const demand = data.demands.find(d => d.id === demandId);
      const name = worker ? worker.name : `#${workerId}`;
      const role = demand ? `${demand.company} ${demand.role}` : `#${demandId}`;
      const toast = document.createElement("div");
      toast.className = "toast-success";
      toast.textContent = `✅ ${name} → ${role} 分配成功`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      loadPipelines();
      loadData();
    } else {
      alert(resp.error || "分配失败");
    }
  } catch (e) {
    alert("分配失败: " + e.message);
  }
}

// Listen for pipeline tab navigation
document.addEventListener("click", function(e) {
  const navItem = e.target.closest(".nav-item[data-view='pipeline']");
  if (navItem) {
    loadPipelines();
  }
});

// ── 登录模式切换 ────────────────────────────────
document.querySelector(".login-tabs")?.addEventListener("click", function(e) {
  const tab = e.target.closest(".login-tab");
  if (!tab) return;
  // 切换高亮
  this.querySelectorAll(".login-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  const mode = tab.dataset.loginMode;
  // 显示/隐藏字段
  document.querySelector(".login-fields-phone").style.display = mode === "phone" ? "" : "none";
  document.querySelector(".login-fields-legacy").style.display = mode === "legacy" ? "" : "none";
});

// ── 分配岗位/求职者 弹窗 ──────────────────────────
let assignMode = "worker"; // "worker" = 给求职者分配岗位, "demand" = 给岗位分配求职者

function showAssignWorker(workerId) {
  assignMode = "worker";
  document.querySelector("#assignWorkerId").value = workerId;
  document.querySelector("#assignDemandId").value = "";
  document.querySelector("#assignModalTitle").textContent = "分配岗位";
  const worker = data.workers.find(w => w.id === workerId);
  document.querySelector("#assignCount").textContent = worker ? `为 ${worker.name} 选择岗位` : "选择岗位";
  renderAssignOptions("");
  document.querySelector("#assignSearch").value = "";
  document.querySelector("#assignModal").showModal();
  setTimeout(() => document.querySelector("#assignSearch")?.focus(), 100);
}

function showAssignDemand(demandId) {
  assignMode = "demand";
  document.querySelector("#assignDemandId").value = demandId;
  document.querySelector("#assignWorkerId").value = "";
  document.querySelector("#assignModalTitle").textContent = "分配求职者";
  const demand = data.demands.find(d => d.id === demandId);
  document.querySelector("#assignCount").textContent = demand ? `为 ${demand.company} ${demand.role} 选择求职者` : "选择求职者";
  renderAssignOptions("");
  document.querySelector("#assignSearch").value = "";
  document.querySelector("#assignModal").showModal();
  setTimeout(() => document.querySelector("#assignSearch")?.focus(), 100);
}

function renderAssignOptions(keyword) {
  const container = document.querySelector("#assignOptions");
  const lowerKw = keyword.toLowerCase().trim();
  if (assignMode === "worker") {
    // 按企业分组显示可用岗位
    const groups = {};
    data.demands.filter(d => remaining(d) > 0).forEach(d => {
      const match = !lowerKw ||
        d.company.toLowerCase().includes(lowerKw) ||
        d.role.toLowerCase().includes(lowerKw) ||
        d.location.toLowerCase().includes(lowerKw) ||
        (d.salary || "").toLowerCase().includes(lowerKw) ||
        (d.notes || "").toLowerCase().includes(lowerKw);
      if (!match) return;
      if (!groups[d.company]) groups[d.company] = [];
      groups[d.company].push(d);
    });
    const companyNames = Object.keys(groups).sort();
    if (!companyNames.length) {
      container.innerHTML = '<p class="assign-empty">没有匹配的岗位</p>';
      return;
    }
    container.innerHTML = companyNames.map(company => `
      <div class="assign-group">
        <div class="assign-group-title">${h(company)}</div>
        ${groups[company].map(d => `
          <div class="assign-item" onclick="doAssignWorker(${d.id})" title="点击分配">
            <span class="assign-item-main">${h(d.role)}</span>
            <span class="assign-item-meta">${h(d.location)}｜${h(d.salary)}｜缺${remaining(d)}人</span>
            <span class="assign-item-badge">${h(d.type)}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  } else {
    // 求职者列表
    const filtered = data.workers.filter(w => {
      if (!lowerKw) return true;
      const text = `${w.name} ${w.phone || ''} ${w.location} ${w.period} ${w.expectedRole || ''} ${w.tags.join(' ')}`.toLowerCase();
      return text.includes(lowerKw);
    });
    if (!filtered.length) {
      container.innerHTML = '<p class="assign-empty">没有匹配的求职者</p>';
      return;
    }
    container.innerHTML = filtered.map(w => `
      <div class="assign-item" onclick="doAssignDemand(${w.id})" title="点击分配">
        <span class="assign-item-main">${h(w.name)} ${w.phone ? '📞' + h(w.phone) : ''}</span>
        <span class="assign-item-meta">${h(w.location)}｜${h(w.period)}｜${w.score}分${w.expectedRole ? '｜期望' + h(w.expectedRole) : ''}</span>
        <span class="assign-item-tags">${w.tags.slice(0, 3).map(t => h(t)).join(' · ')}</span>
      </div>
    `).join('');
  }
}

function doAssignWorker(demandId) {
  const workerId = Number(document.querySelector("#assignWorkerId").value);
  if (!workerId) return;
  assignWorkerToDemand(workerId, demandId);
}

function doAssignDemand(workerId) {
  const demandId = Number(document.querySelector("#assignDemandId").value);
  if (!demandId) return;
  assignWorkerToDemand(workerId, demandId);
}

// 搜索输入实时过滤
document.querySelector("#assignSearch")?.addEventListener("input", function() {
  renderAssignOptions(this.value);
});
