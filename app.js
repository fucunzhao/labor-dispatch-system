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
  renderAssignments();
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
  renderRolePanel();
}

async function renderRolePanel() {
  const container = document.querySelector("#rolePanel");
  if (!container) return;
  if (!account) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `<p class="item-meta" style="padding:12px">正在加载个性化面板…</p>`;
  try {
    const resp = await api("/api/dashboard");
    if (!resp.ok) { container.innerHTML = ""; return; }
    const d = resp.dashboard;
    const role = d.role;
    let html = "";

    // —— 所有角色都看到的"漏斗" ——
    const f = d.funnel || {};
    const totals = d.totals || {};
    const funnelStages = [
      ["assigned", "已分配", "#0f7a68"],
      ["contacted", "已联系", "#16804f"],
      ["interviewed", "已面试", "#b76b12"],
      ["onboarded", "已入职", "#0b5d50"],
      ["stationed", "在岗", "#0f7a68"],
    ];
    const terminalStages = [
      ["rejected", "未通过", "#b33434"],
      ["no_show", "未到场", "#888"],
      ["recommended_other", "推荐其他", "#888"],
      ["departed", "已离职", "#b33434"],
    ];
    const maxF = Math.max(...funnelStages.map(s => f[s[0]] || 0), 1);
    html += `<section class="panel" style="margin-bottom:16px">
      <div class="panel-head"><h2>招聘漏斗</h2>
        <span>入职率 <strong style="color:#0f7a68">${totals.onboard_rate || 0}%</strong> · 未通过率 ${totals.rejection_rate || 0}% · 未到场率 ${totals.no_show_rate || 0}%</span>
      </div>
      <div style="display:flex;gap:8px;padding:16px;align-items:flex-end;height:120px">
        ${funnelStages.map(([k, label, color]) => {
          const n = f[k] || 0;
          const pct = Math.max(n / maxF * 100, 4);
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
            <strong style="font-size:18px">${n}</strong>
            <div style="width:100%;background:${color};height:${pct}%;border-radius:4px 4px 0 0;min-height:4px"></div>
            <small style="color:var(--muted)">${label}</small>
          </div>`;
        }).join("")}
      </div>
      <div style="padding:8px 16px;display:flex;gap:16px;flex-wrap:wrap;border-top:1px solid var(--line)">
        ${terminalStages.map(([k, label, color]) => `<small style="color:${color}">${label}: <strong>${f[k] || 0}</strong></small>`).join("")}
      </div>
    </section>`;

    // —— 角色特定 ——
    if (role === "owner") {
      const kpi = d.kpi || {};
      const team = d.team_load || [];
      html += `<section class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>团队工作量</h2>
          <span>共 ${kpi.total_accounts || 0} 人 · ${kpi.total_demands || 0} 个 active 需求 · ${kpi.total_workers || 0} 个求职者</span>
        </div>
        ${team.length ? `<div class="table-wrap"><table>
          <thead><tr><th>姓名</th><th>角色</th><th>对接企业</th><th>负责求职者</th><th>活跃流程</th></tr></thead>
          <tbody>${team.map(m => `<tr>
            <td><strong>${h(m.name)}</strong></td>
            <td>${tag({sales:"业务运营专员",dispatcher:"招聘专员",service:"客服人员"}[m.role] || m.role)}</td>
            <td>${m.demand_count}</td>
            <td>${m.worker_count}</td>
            <td>${m.active_pipeline_count}</td>
          </tr>`).join("")}</tbody></table></div>` : '<p class="item-meta" style="padding:16px">还没有团队成员账号</p>'}
      </section>`;
    }
    else if (role === "sales") {
      const myDemands = d.my_demands || [];
      html += `<section class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>我对接的企业需求</h2><span>共 ${myDemands.length} 条</span></div>
        ${myDemands.length ? `<div class="table-wrap"><table>
          <thead><tr><th>企业 · 岗位</th><th>地点</th><th>需求人数</th><th>缺口</th><th>状态</th><th>活跃流程</th></tr></thead>
          <tbody>${myDemands.map(d2 => `<tr ${d2.status==='closed' ? 'style="opacity:0.5"' : ''}>
            <td><strong>${h(d2.company)}</strong> · ${h(d2.role)}</td>
            <td>${h(d2.location)}</td>
            <td>${d2.headcount}</td>
            <td>${tag(d2.gap + " 人", d2.gap > 5 ? "danger" : "warn")}</td>
            <td>${d2.status === 'closed' ? tag('已关闭','danger') : (d2.gap === 0 ? tag('已满员') : tag('招聘中','warn'))}</td>
            <td>${d2.active_pipeline_count} 个</td>
          </tr>`).join("")}</tbody></table></div>` : '<p class="item-meta" style="padding:16px">老板还没分配企业给你。可以让老板在"人员分派"页面把企业需求分配给你。</p>'}
      </section>`;
    }
    else if (role === "dispatcher") {
      const myWorkers = d.my_workers || [];
      const todo = d.todo_pipelines || [];
      const STATUS_NAMES_LOCAL = {
        assigned: "已分配", contacted: "已联系", interviewed: "已面试",
        onboarded: "已入职", stationed: "在岗"
      };
      html += `<section class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>我负责的求职者</h2><span>共 ${myWorkers.length} 人 · ${myWorkers.filter(x=>x.current_status).length} 人有活跃流程</span></div>
        ${myWorkers.length ? `<div class="table-wrap"><table>
          <thead><tr><th>姓名 · 电话</th><th>地点</th><th>到岗时间</th><th>当前流程</th></tr></thead>
          <tbody>${myWorkers.map(w => `<tr>
            <td><strong>${h(w.name)}</strong><br><small style="color:var(--muted)">${h(w.phone || '')}</small></td>
            <td>${h(w.location)}</td>
            <td>${h(w.available || '-')}</td>
            <td>${w.current_status ? `${h(w.current_company)} · ${h(w.current_role)}<br>${tag(STATUS_NAMES_LOCAL[w.current_status] || w.current_status, 'warn')}` : '<small style="color:var(--muted)">无活跃流程</small>'}</td>
          </tr>`).join("")}</tbody></table></div>` : '<p class="item-meta" style="padding:16px">老板还没分配求职者给你。</p>'}
      </section>
      <section class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>待推进的流程</h2><span>${todo.length} 条等你跟进</span></div>
        ${todo.length ? `<div class="table-wrap"><table>
          <thead><tr><th>候选人</th><th>对应岗位</th><th>当前状态</th><th>更新时间</th></tr></thead>
          <tbody>${todo.map(t => `<tr>
            <td><strong>${h(t.worker_name)}</strong></td>
            <td>${h(t.demand_company)} · ${h(t.demand_role)}</td>
            <td>${tag(STATUS_NAMES_LOCAL[t.status] || t.status, 'warn')}</td>
            <td><small>${(t.updated_at || '').slice(0,16)}</small></td>
          </tr>`).join("")}</tbody></table></div>` : '<p class="item-meta" style="padding:16px">暂无待推进流程</p>'}
      </section>`;
    }

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p class="item-meta" style="padding:12px;color:var(--danger)">个性化面板加载失败：${escapeHtml(e.message || String(e))}</p>`;
  }
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
  const showClosed = document.querySelector("#demandShowClosed")?.checked || false;
  const rows = data.demands.filter(item => {
    const text = `${item.company} ${item.role} ${item.location} ${item.type} ${item.notes}`.toLowerCase();
    if (!text.includes(keyword)) return false;
    const status = item.status || "active";
    if (!showClosed && status === "closed") return false;
    return true;
  });
  els.demandTable.innerHTML = rows.map(item => {
    const matches = rankWorkers(item).slice(0, 2);
    const status = item.status || "active";
    const isClosed = status === "closed";
    const isFull = remaining(item) === 0;
    const rowStyle = isClosed ? 'style="opacity:0.5;background:#f5f5f5"' : '';
    let statusCell;
    if (isClosed) {
      statusCell = tag("已关闭", "danger");
    } else if (isFull) {
      statusCell = tag("已满员") + ' <small style="color:#b76b12">建议关闭</small>';
    } else {
      statusCell = tag("匹配中", "warn");
    }
    const ownerActions = hasRole('demands','write') ? (
      isClosed
        ? `<button class="ghost" onclick="toggleDemandStatus(${item.id},'active')" style="font-size:12px;color:#0f7a68">重新打开</button>`
        : `<button class="ghost" onclick="toggleDemandStatus(${item.id},'closed')" style="font-size:12px;color:#b33434">关闭需求</button>`
    ) : '';
    const assignBtn = (!isClosed && hasRole('pipeline','assign'))
      ? `<button class="ghost" onclick="showAssignDemand(${item.id})" data-write style="font-size:12px" data-perm="pipeline.assign">分配求职者</button>`
      : '';
    return `
      <tr ${rowStyle}>
        <td><strong>${h(item.company)}</strong><br><span class="item-meta">${h(item.location)}</span></td>
        <td>${h(item.role)}<br>${tag(item.type)}</td>
        <td>${h(formatDateRange(item))}</td>
        <td>${h(item.headcount)} 人</td>
        <td>${tag(`${remaining(item)} 人`, remaining(item) > 50 ? "danger" : "warn")}</td>
        <td>${h(item.salary)}</td>
        <td>${statusCell}</td>
        <td>${matches.map(match => `<span title="${h(match.reasons.join(' | '))}">${h(match.worker.name)} <strong>${match.score}分</strong><br><span style="font-size:11px;color:#888">${match.reasons.slice(0,2).map(h).join(' · ') || ''}</span></span>`).join("<br>") || "暂无"}</td>
        <td>${assignBtn} ${ownerActions}</td>
      </tr>
    `;
  }).join("");
}

async function toggleDemandStatus(demandId, newStatus) {
  const labelMap = { active: "重新打开", closed: "关闭" };
  if (!confirm(`确认${labelMap[newStatus]}该需求？\n\n关闭后无法再分配新候选人，已有的活跃流程不受影响；重新打开后可继续分配。`)) return;
  try {
    const resp = await api("/api/demands/status", {
      method: "POST",
      body: JSON.stringify({ demand_id: demandId, status: newStatus })
    });
    if (!resp.ok) { alert(resp.error || "操作失败"); return; }
    if (resp.data) { data = resp.data; renderAll(); }
    else { await loadData(); }
    alert(resp.msg || "已更新");
  } catch (e) { alert("操作失败：" + e.message); }
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
          <span class="item-meta">${best ? `${h(best.demand.company)} · ${h(best.demand.role)}（${best.score}分）<br>${best.reasons.slice(0,2).map(r => `<small style="color:#888">${h(r)}</small>`).join(' ')}` : "暂无合适岗位"}</span>
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


function renderAssignments() {
  if (!account || account.role !== "owner") return;
  const assignments = data.assignments || [];
  const accounts = data.accounts || [];

  function userName(id) {
    const a = accounts.find(x => x.id === id);
    return a ? a.name : `ID:${id}`;
  }

  // 企业需求分派列表
  const ds = data.demands || [];
  const demandHtml = ds.map(d => {
    const ass = assignments.find(x => x.entityType === "demand" && x.entityId === d.id);
    return `<div class="assign-row">
      <span class="assign-row-name">${h(d.company)} · ${h(d.role)}</span>
      <select class="assign-user-select" data-entity-type="demand" data-entity-id="${d.id}" onchange="manualAssign(this)">
        <option value="">— 未分派 —</option>
        ${accounts.filter(acc => acc.role === "sales").map(acc =>
          `<option value="${acc.id}"${acc.id === (ass?.assignedTo || 0) ? " selected" : ""}>${h(acc.name)}</option>`
        ).join("")}
      </select>
      ${ass ? `<span class="assign-tag">${h(userName(ass.assignedTo))}</span>` : '<span class="assign-tag muted">未分派</span>'}
    </div>`;
  }).join("") || '<p class="assign-empty">暂无企业需求</p>';
  document.querySelector("#assignDemandList").innerHTML = `<div class="assign-list-inner">${demandHtml}</div>`;

  // 求职者分派列表
  const ws = data.workers || [];
  const workerHtml = ws.map(w => {
    const ass = assignments.find(x => x.entityType === "worker" && x.entityId === w.id);
    return `<div class="assign-row">
      <span class="assign-row-name">${h(w.name)}${w.phone ? ' 📞' + h(w.phone) : ''}</span>
      <select class="assign-user-select" data-entity-type="worker" data-entity-id="${w.id}" onchange="manualAssign(this)">
        <option value="">— 未分派 —</option>
        ${accounts.filter(acc => acc.role === "dispatcher").map(acc =>
          `<option value="${acc.id}"${acc.id === (ass?.assignedTo || 0) ? " selected" : ""}>${h(acc.name)}</option>`
        ).join("")}
      </select>
      ${ass ? `<span class="assign-tag">${h(userName(ass.assignedTo))}</span>` : '<span class="assign-tag muted">未分派</span>'}
    </div>`;
  }).join("") || '<p class="assign-empty">暂无求职者</p>';
  document.querySelector("#assignWorkerList").innerHTML = `<div class="assign-list-inner">${workerHtml}</div>`;
}

async function autoAssign(entityType) {
  if (!account) return;
  const btn = document.querySelector(`#autoAssign${entityType === "demand" ? "Demand" : "Worker"}Btn`);
  const statusEl = document.querySelector(`#assign${entityType === "demand" ? "Demand" : "Worker"}Status`);
  if (!btn || !statusEl) return;
  btn.disabled = true;
  btn.textContent = "分配中...";
  try {
    const payload = await api("/api/assignments/auto", {
      method: "POST",
      body: JSON.stringify({ entityType })
    });
    if (payload.data) {
      data = payload.data;
      renderAssignments();
    }
    statusEl.textContent = payload.msg || "已完成";
    statusEl.style.color = "#0d5b38";
  } catch (e) {
    statusEl.textContent = "分配失败: " + e.message;
    statusEl.style.color = "#8a2424";
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 自动分配";
  }
}

async function manualAssign(selectEl) {
  const entityType = selectEl.dataset.entityType;
  const entityId = Number(selectEl.dataset.entityId);
  const assignedTo = Number(selectEl.value);
  if (!assignedTo) return;
  try {
    const payload = await api("/api/assignments/manual", {
      method: "POST",
      body: JSON.stringify({ entityType, entityIds: [entityId], assignedTo })
    });
    if (payload.data) {
      data = payload.data;
      renderAssignments();
    }
  } catch (e) {
    selectEl.value = "";
    alert("分配失败: " + e.message);
  }
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

// ── 多维匹配辅助函数 ──────────────────────────────────────────────

// 地区标准化映射：将自由文本映射到层级 city > district > zone
const LOCATION_MAP = {
  city: ["柳州", "柳城", "融安", "融水", "三江"],
  district: {
    "柳东":   ["柳东", "柳东新区", "柳东园区", "阳和工业新区", "官塘", "柳东花岭", "柳东花玲"],
    "柳北":   ["柳北", "柳北区", "河北"],
    "城中":   ["城中", "城中区", "谷埠"],
    "鱼峰":   ["鱼峰", "鱼峰区", "洛埠"],
    "柳南":   ["柳南", "柳南区", "太阳村"],
    "柳江":   ["柳江", "柳江区", "拉堡"],
  }
};

function scoreLocation(workerLoc, demandLoc) {
  if (!workerLoc || !demandLoc) return { score: 0, reason: "" };
  const wl = workerLoc.toLowerCase();
  const dl = demandLoc.toLowerCase();
  // 精确包含
  if (wl.includes(dl) || dl.includes(wl) || wl === dl) {
    return { score: 40, reason: `地区精确匹配（${demandLoc}）` };
  }
  // 同区域
  for (const [district, zones] of Object.entries(LOCATION_MAP.district)) {
    const wInZone = zones.some(z => wl.includes(z.toLowerCase()));
    const dInZone = zones.some(z => dl.includes(z.toLowerCase()));
    if (wInZone && dInZone) {
      return { score: 25, reason: `同区域（${district}）` };
    }
  }
  // 同城
  const sameCity = LOCATION_MAP.city.some(c => wl.includes(c) && dl.includes(c));
  if (sameCity) return { score: 10, reason: "同城市" };
  return { score: 0, reason: "" };
}

// 时间周期标准化
function normalizePeriod(text) {
  if (!text) return "unknown";
  const t = text.toLowerCase();
  if (t.includes("长期") || t.includes("稳定") || t.includes("正式")) return "long";
  if (t.includes("暑假") || t.includes("寒假") || t.includes("假期")) return "seasonal";
  if (t.includes("1-3") || t.includes("3个月") || t.includes("1个月") || t.includes("2个月")) return "medium";
  if (t.includes("7-15") || t.includes("半月") || t.includes("短期") || t.includes("临时")) return "short";
  if (t.includes("弹性") || t.includes("灵活") || t.includes("兼职")) return "flexible";
  return "unknown";
}

// 时间周期兼容矩阵（岗位需求类型 → 求职者类型 → 得分）
const PERIOD_MATRIX = {
  long:     { long: 25, medium: 12, seasonal: 5,  short: 0,  flexible: 8,  unknown: 5 },
  medium:   { long: 15, medium: 25, seasonal: 15, short: 10, flexible: 15, unknown: 8 },
  seasonal: { long: 5,  medium: 15, seasonal: 25, short: 15, flexible: 15, unknown: 8 },
  short:    { long: 0,  medium: 10, seasonal: 15, short: 25, flexible: 20, unknown: 8 },
  flexible: { long: 8,  medium: 15, seasonal: 15, short: 20, flexible: 25, unknown: 8 },
  unknown:  { long: 8,  medium: 8,  seasonal: 8,  short: 8,  flexible: 8,  unknown: 5 },
};

function scorePeriod(workerPeriod, demandType) {
  const w = normalizePeriod(workerPeriod);
  const d = normalizePeriod(demandType);
  const s = (PERIOD_MATRIX[d] || PERIOD_MATRIX.unknown)[w] || 5;
  const labels = { long: "长期稳定", medium: "中期", seasonal: "季节性", short: "短期", flexible: "弹性" };
  const wLabel = labels[w] || workerPeriod;
  const dLabel = labels[d] || demandType;
  const reason = s >= 20 ? `周期完全匹配（${wLabel}）` : s >= 12 ? `周期兼容（${wLabel}↔${dLabel}）` : "";
  return { score: s, reason };
}

// 薪资解析：返回 { min, max, unit } unit=month|hour|day
function parseSalary(text) {
  if (!text) return null;
  const t = text.replace(/,/g, "").toLowerCase();
  // 区间 5000-5500
  let m = t.match(/(\d{3,5})\s*[-~至到]\s*(\d{3,5})/);
  if (m) return { min: +m[1], max: +m[2], unit: "month" };
  // X以上 / X+
  m = t.match(/(\d{3,5})\s*(?:以上|\+|起)/);
  if (m) return { min: +m[1], max: null, unit: "month" };
  // X元/小时
  m = t.match(/(\d{2,3})\s*元?\s*[\/每]\s*(?:小时|时)/);
  if (m) return { min: +m[1] * 8 * 22, max: null, unit: "month" }; // 换算月薪
  // 周结 / 日结 — 视为弹性
  if (t.includes("周结") || t.includes("日结") || t.includes("面议")) return { min: 0, max: null, unit: "flexible" };
  return null;
}

function scoreSalary(workerSalary, demandSalary) {
  const w = parseSalary(workerSalary);
  const d = parseSalary(demandSalary);
  if (!w || !d) return { score: 8, reason: "" }; // 无法解析给基础分
  if (w.unit === "flexible" || d.unit === "flexible") return { score: 10, reason: "薪资弹性接受" };
  const wMin = w.min;
  const dMax = d.max || d.min * 1.2;
  const dMin = d.min;
  if (wMin <= dMax && wMin >= dMin) return { score: 15, reason: `薪资吻合（期望${workerSalary}）` };
  if (wMin <= dMax) return { score: 12, reason: `薪资在范围内` };
  if (wMin <= dMax * 1.1) return { score: 6, reason: `薪资略超（${workerSalary}）` };
  return { score: 0, reason: "" };
}

// 技能标签匹配（最高20分）
const SKILL_SYNONYMS = {
  "打包": "包装", "封装": "包装", "抽检": "质检", "检验": "质检",
  "压铸": "注塑", "射出": "注塑", "仓库": "物流", "搬运": "物流",
  "磨光": "抛光", "打磨": "抛光", "流水线": "坐班"
};

function scoreSkills(workerTags, demandRole, demandNotes) {
  const demandText = `${demandRole} ${demandNotes}`.toLowerCase();
  const normalize = t => SKILL_SYNONYMS[t] || t;
  const matched = [];
  let pts = 0;
  for (const rawTag of workerTags) {
    const tag = normalize(rawTag);
    if (demandText.includes(tag.toLowerCase()) || demandText.includes(rawTag.toLowerCase())) {
      if (!matched.includes(tag)) {
        matched.push(tag);
        pts += 7;
      }
    }
  }
  pts = Math.min(pts, 20);
  const reason = matched.length ? `技能匹配：${matched.slice(0, 3).join("、")}` : "";
  return { score: pts, reason };
}

// ── 主评分函数（四维，满分100） ─────────────────────────────────────
function rankWorkers(demand) {
  return data.workers.map(worker => {
    const loc   = scoreLocation(worker.location, demand.location);
    const per   = scorePeriod(worker.period, demand.type);
    const sal   = scoreSalary(worker.salary, demand.salary);
    const skill = scoreSkills(worker.tags, demand.role, demand.notes || "");

    const total = Math.min(loc.score + per.score + sal.score + skill.score, 100);
    const reasons = [loc.reason, per.reason, sal.reason, skill.reason].filter(Boolean);

    // 维度明细，供前端展示进度条
    const breakdown = [
      { label: "地区", score: loc.score,   max: 40 },
      { label: "周期", score: per.score,   max: 25 },
      { label: "薪资", score: sal.score,   max: 15 },
      { label: "技能", score: skill.score, max: 20 },
    ];

    return { worker, score: total, reasons, breakdown };
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
document.querySelector("#demandShowClosed")?.addEventListener("change", renderDemandTable);
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

async function _dangerousAction({ endpoint, actionLabel, warning }) {
  const companyName = (account && account.company) ? account.company : "";
  if (!companyName) {
    alert("当前账号未绑定企业名称，无法执行此操作。");
    return null;
  }
  const confirmation = window.prompt(
    warning + "\n\n操作不可恢复。请输入当前企业名称以确认：\n\n" + companyName
  );
  if (confirmation === null) return null;
  if (confirmation.trim() !== companyName) {
    alert("输入的企业名称不匹配，操作已取消。");
    return null;
  }
  if (!window.confirm("最后确认：" + actionLabel + "\n\n点击确定执行，取消则放弃。")) return null;
  try {
    const payload = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ confirmation: confirmation })
    });
    return payload;
  } catch (err) {
    alert("操作失败：" + (err.message || err));
    return null;
  }
}

document.querySelector("#resetDemo").addEventListener("click", async () => {
  const payload = await _dangerousAction({
    endpoint: "/api/reset",
    actionLabel: "恢复示例数据",
    warning: "即将清空当前企业的全部业务数据并写入 12 条示例需求 + 5 个示例求职者。"
  });
  if (!payload) return;
  data = payload.data;
  renderAll();
  alert("示例数据已恢复。");
});

const _clearBtn = document.querySelector("#clearTenantData");
if (_clearBtn) _clearBtn.addEventListener("click", async () => {
  const payload = await _dangerousAction({
    endpoint: "/api/clear-data",
    actionLabel: "彻底清空当前企业的全部业务数据",
    warning: "即将清空：企业需求、求职者、招聘流程、人员分派、知识库、AI 对话历史。\n\n此操作不可恢复！"
  });
  if (!payload) return;
  data = payload.data;
  renderAll();
  alert("当前企业的全部业务数据已清空。");
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
  onboarded: "已入职", stationed: "在岗",
  rejected: "面试未通过", no_show: "未到场",
  recommended_other: "推荐其他岗位", departed: "已离职"
};
const STATUS_TRANSITIONS = {
  assigned:    ["contacted", "no_show", "recommended_other"],
  contacted:   ["interviewed", "no_show", "recommended_other"],
  interviewed: ["onboarded", "rejected", "no_show", "recommended_other"],
  onboarded:   ["stationed", "departed"],
  stationed:   ["departed"],
  rejected: [], no_show: [], recommended_other: [], departed: []
};
const STATUS_TERMINAL = new Set(["rejected", "no_show", "recommended_other", "departed"]);
const STATUS_REASON_REQUIRED = new Set(["rejected", "no_show", "recommended_other", "departed"]);
const STATUS_REASON_PROMPT = {
  rejected: "面试未通过的原因（例如：经验不足/年龄不符/纹身/面试表现差）",
  no_show:  "未到场的原因（例如：路途远/已接其他 offer/失联）",
  recommended_other: "推荐到其他岗位的原因（例如：更适合 XX 厂坐班）",
  departed: "离职原因（例如：试用期不合适/家中有事/找到新工作）",
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
      <td><span class="status-badge status-${p.status}">${statusLabel}</span>${(STATUS_TERMINAL.has(p.status) && p.outcome_reason) ? `<br><small style="color:var(--muted)" title="${escapeHtml(p.outcome_reason)}">原因：${escapeHtml(p.outcome_reason.slice(0,30))}${p.outcome_reason.length>30?'…':''}</small>` : ''}</td>
      <td><small>${p.updated_at?.slice(0,16) || '-'}</small></td>
      <td class="pipeline-actions">
        ${hasRole('pipeline', 'advance') ? nextStatuses.map(s => {
          const isTerm = STATUS_TERMINAL.has(s);
          const cls = isTerm ? 'btn' : 'btn btn-primary';
          const style = isTerm ? 'style="color:var(--danger)"' : '';
          const arrow = isTerm ? '×' : '→';
          return `<button class="${cls}" ${style} onclick="updatePipelineStatus(${p.id},'${s}')">${arrow} ${STATUS_NAMES[s]}</button>`;
        }).join('') : ''}
        ${(hasRole('pipeline', 'revert') && canGoBack) ? `<button class="btn" onclick="updatePipelineStatus(${p.id},'${canGoBack}')">← 退回</button>` : ''}
        <button class="btn" onclick="showPipelineEvents(${p.id},'${escapeHtml(p.worker_name)} → ${escapeHtml(p.demand_company+' '+p.demand_role)}')" title="查看服务记录">📋 记录</button>
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
          ${hasRole('pipeline', 'advance') ? nextStatuses.map(s => {
            const isTerm = STATUS_TERMINAL.has(s);
            const cls = isTerm ? 'btn' : 'btn btn-primary';
            const style = isTerm ? 'style="color:var(--danger)"' : '';
            const arrow = isTerm ? '×' : '→';
            return `<button class="${cls}" ${style} onclick="updatePipelineStatus(${p.id},'${s}')">${arrow} ${STATUS_NAMES[s]}</button>`;
          }).join('') : ''}
          ${(hasRole('pipeline', 'revert') && canGoBack) ? `<button class="btn" onclick="updatePipelineStatus(${p.id},'${canGoBack}')">← 退回</button>` : ''}
          <button class="btn" onclick="showPipelineEvents(${p.id},'${escapeHtml(p.worker_name)}')" title="服务记录">📋</button>
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
  let reason = "";
  let target_demand_id = 0;

  // recommended_other 特殊处理：要选目标需求 + 填理由
  if (newStatus === "recommended_other") {
    // 列出当前租户的所有 active 且未满员的 demand
    const currentP = pipelineData.find(x => x.id === pipelineId);
    const currentDemandId = currentP ? currentP.demand_id : 0;
    const candidates = (data.demands || []).filter(d => {
      const s = d.status || "active";
      if (s !== "active") return false;
      if (d.id === currentDemandId) return false;
      const remain = Math.max(Number(d.headcount) - Number(d.signed || 0), 0);
      return remain > 0;
    });
    if (!candidates.length) {
      alert("当前没有其他可推荐的活跃需求（要求：状态 active 且未满员）。");
      return;
    }
    const listText = candidates.map((d, i) => `${i + 1}. ${d.company} · ${d.role}（${d.location}，剩 ${Math.max(d.headcount - (d.signed||0), 0)} 人）`).join("\n");
    const pick = window.prompt(`【推荐到其他岗位】\n\n请输入目标需求编号（1-${candidates.length}）：\n\n${listText}`);
    if (pick === null) return;
    const idx = parseInt((pick || "").trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
      alert("无效编号，操作取消。");
      return;
    }
    target_demand_id = candidates[idx].id;
    const reasonInput = window.prompt(`【推荐到其他岗位】\n\n目标：${candidates[idx].company} · ${candidates[idx].role}\n\n请填写推荐原因（例如：更适合 XX 厂坐班）：`);
    if (reasonInput === null) return;
    reason = (reasonInput || "").trim();
    if (!reason) { alert("必须填写推荐原因。"); return; }
  }
  // 其他终态：只要原因
  else if (STATUS_REASON_REQUIRED.has(newStatus)) {
    const prompt_text = STATUS_REASON_PROMPT[newStatus] || "请填写原因";
    const v = window.prompt(`推进到【${STATUS_NAMES[newStatus]}】\n\n${prompt_text}：`);
    if (v === null) return;
    reason = (v || "").trim();
    if (!reason) { alert("必须填写原因才能推进到该状态。"); return; }
  }

  try {
    const body = { pipeline_id: pipelineId, status: newStatus, reason: reason };
    if (target_demand_id) body.target_demand_id = target_demand_id;
    const resp = await api("/api/pipeline/status", {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (resp.ok) {
      if (resp.new_pipeline_id) {
        alert(`已转介，新流程 #${resp.new_pipeline_id} 已创建。`);
      }
      loadPipelines();
      // 也刷新 demands 视图，让 signed 数字更新
      await loadData();
    } else {
      alert(resp.error || "更新失败");
    }
  } catch (e) {
    alert("更新失败: " + e.message);
  }
}

// ── 服务记录时间轴 ──────────────────────────────
async function showPipelineEvents(pipelineId, title) {
  const modal = document.querySelector("#eventsModal");
  if (!modal) return;
  document.querySelector("#eventsModalTitle").textContent = title || "服务记录";
  document.querySelector("#eventsModalPipelineId").value = pipelineId;
  document.querySelector("#eventsNoteInput").value = "";
  document.querySelector("#eventsTimeline").innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">加载中…</p>';
  modal.showModal();
  await refreshPipelineEvents(pipelineId);
}

async function refreshPipelineEvents(pipelineId) {
  try {
    const resp = await api(`/api/pipeline/events?pipeline_id=${pipelineId}`);
    const timeline = document.querySelector("#eventsTimeline");
    if (!resp.ok) { timeline.innerHTML = `<p style="color:var(--danger)">加载失败：${escapeHtml(resp.error || "")}</p>`; return; }
    const events = resp.events || [];
    if (!events.length) {
      timeline.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">暂无服务记录</p>';
      return;
    }
    const EVENT_ICONS = { status_change: "🔄", note: "📝", assign: "📌" };
    timeline.innerHTML = `<div class="events-list">` + events.map(ev => `
      <div class="event-item">
        <span class="event-icon">${EVENT_ICONS[ev.event_type] || "•"}</span>
        <div class="event-body">
          <div class="event-content">${escapeHtml(ev.content || "")}</div>
          <div class="event-meta">
            ${ev.operator_name ? escapeHtml(ev.operator_name) + ' · ' : ''}${(ev.created_at || '').slice(0, 16)}
          </div>
        </div>
      </div>`).join('') + `</div>`;
  } catch (e) {
    document.querySelector("#eventsTimeline").innerHTML = `<p style="color:var(--danger)">加载失败</p>`;
  }
}

async function addPipelineNote() {
  const pipelineId = Number(document.querySelector("#eventsModalPipelineId").value);
  const note = document.querySelector("#eventsNoteInput").value.trim();
  if (!pipelineId || !note) { alert("请输入备注内容"); return; }
  try {
    const resp = await api("/api/pipeline/note", {
      method: "POST",
      body: JSON.stringify({ pipeline_id: pipelineId, note })
    });
    if (resp.ok) {
      document.querySelector("#eventsNoteInput").value = "";
      await refreshPipelineEvents(pipelineId);
    } else {
      alert(resp.error || "添加备注失败");
    }
  } catch (e) {
    alert("添加备注失败: " + e.message);
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
    const demandId = Number(document.querySelector("#assignDemandId").value);
    const targetDemand = data.demands.find(d => d.id === demandId);
    const scored = targetDemand ? rankWorkers(targetDemand) : [];
    const scoreMap = {};
    scored.forEach(s => { scoreMap[s.worker.id] = s; });

    // 从 pipelineData 计算活跃求职者 (B方案：🔒 锁定标记)
    const activeWorkerMap = {};
    (pipelineData || []).forEach(p => {
      if (p.status !== 'departed') {
        activeWorkerMap[p.worker_id] = { company: p.demand_company, role: p.demand_role, status: STATUS_NAMES[p.status] || p.status };
      }
    });
    container.innerHTML = filtered.map(w => {
      const matchData = scoreMap[w.id];
      const matchScore = matchData ? matchData.score : null;
      const matchReasons = matchData ? matchData.reasons.slice(0, 2) : [];
      const matchBreakdown = matchData ? matchData.breakdown : [];
      const barHtml = matchBreakdown.map(b =>
        `<span title="${b.label}:${b.score}/${b.max}" style="display:inline-block;width:${Math.round(b.score/b.max*40)}px;height:4px;background:${b.score >= b.max*0.7 ? '#4caf50' : b.score >= b.max*0.4 ? '#ff9800' : '#e0e0e0'};border-radius:2px;margin-right:2px;vertical-align:middle"></span>`
      ).join('');
      const activeInfo = activeWorkerMap[w.id];
      if (activeInfo) {
        // 已有活跃流程：显示锁定状态，不可点击
        return `
        <div class="assign-item assign-item-locked" title="该求职者已有活跃流程，请先结束再分配" style="opacity:0.55;cursor:not-allowed;background:var(--bg-secondary,#f8f8f8)">
          <span class="assign-item-main">🔒 ${h(w.name)} ${w.phone ? '📞' + h(w.phone) : ''}</span>
          <span class="assign-item-meta" style="color:var(--warning,#ff9800)">${h(activeInfo.company)} · ${h(activeInfo.role)} · ${h(activeInfo.status)}</span>
          <span style="font-size:11px;color:var(--muted)">已有活跃流程，不可重复分配</span>
        </div>`;
      }
      return `
      <div class="assign-item" onclick="doAssignDemand(${w.id})" title="点击分配">
        <span class="assign-item-main">${h(w.name)} ${w.phone ? '📞' + h(w.phone) : ''}</span>
        <span class="assign-item-meta">${h(w.location)}｜${h(w.period)}${matchScore !== null ? `｜<strong>${matchScore}分</strong>` : `｜${w.score}分`}${w.expectedRole ? '｜期望' + h(w.expectedRole) : ''}</span>
        ${matchReasons.length ? `<span style="font-size:11px;color:#888">${matchReasons.map(h).join(' · ')}</span>` : ''}
        ${barHtml ? `<div style="margin-top:4px">${barHtml}</div>` : ''}
        <span class="assign-item-tags">${w.tags.slice(0, 3).map(t => h(t)).join(' · ')}</span>
      </div>`;
    }).join('');
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
