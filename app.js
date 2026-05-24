const today = new Date();
const currentYear = today.getFullYear();

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
renderAccount();

function renderAccount() {
  const roleNames = { owner: "老板/管理员", sales: "业务员", dispatcher: "调度员", service: "客服人员" };
  const label = account ? `${account.company || account.name}｜${roleNames[account.role] || account.role}` : "未登录";
  els.accountBadge.textContent = label;
  els.accountStatus.textContent = account ? `当前登录：${label}` : "当前未登录";
  document.querySelectorAll("[data-write]").forEach(item => {
    item.disabled = !account;
    item.title = account ? "" : "请先登录账号";
  });
  // 让"求职者自助登记"链接带上当前中介的 companyKey，未登录时禁用
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
    <div class="form-grid">
        <label>企业<input data-field="company" value="${escapeAttr(item.company)}"></label>
        <label>岗位<input data-field="role" value="${escapeAttr(item.role)}"></label>
        <label>类型<select data-field="type">${["长期工", "短期工", "日结工", "季节工"].map(type => `<option ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
        <label>地点<input data-field="location" value="${escapeAttr(item.location)}"></label>
        <label>开始日期<input data-field="start" type="date" value="${escapeAttr(item.start)}"></label>
        <label>结束日期<input data-field="end" type="date" value="${escapeAttr(item.end)}"></label>
        <label>人数<input data-field="headcount" type="number" min="1" value="${Number(item.headcount) || 20}"></label>
        <label>年龄<input data-field="age" value="${escapeAttr(item.age)}"></label>
        <label>薪资<input data-field="salary" value="${escapeAttr(item.salary)}"></label>
      </div>
      <label>原文/备注<textarea data-field="notes">${escapeHtml(item.notes || "")}</textarea></label>
  `;
}

function workerFuzzyFields(item) {
  return `
    <div class="form-grid">
      <label>姓名<input data-field="name" value="${escapeAttr(item.name)}"></label>
      <label>手机号<input data-field="phone" value="${escapeAttr(item.phone)}"></label>
      <label>性别<select data-field="gender"><option value="">未确认</option><option ${item.gender === "男" ? "selected" : ""}>男</option><option ${item.gender === "女" ? "selected" : ""}>女</option></select></label>
      <label>年龄<input data-field="age" value="${escapeAttr(item.age)}"></label>
      <label>地区<input data-field="location" value="${escapeAttr(item.location)}"></label>
      <label>可到岗<input data-field="available" value="${escapeAttr(item.available)}"></label>
      <label>周期<input data-field="period" value="${escapeAttr(item.period)}"></label>
      <label>期望岗位<input data-field="expectedRole" value="${escapeAttr(item.expectedRole)}"></label>
      <label>期望薪资<input data-field="salary" value="${escapeAttr(item.salary)}"></label>
    </div>
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
        <p class="item-meta">${[worker.gender, worker.age ? `${worker.age}岁` : "", worker.phone].filter(Boolean).map(h).join("｜") || "基础信息待补充"}</p>
        ${worker.expectedRole ? `<p>期望岗位：${h(worker.expectedRole)}</p>` : ""}
        <p>${h(worker.salary || "薪资待确认")}｜稳定性 ${Number(worker.score) || 0} 分</p>
        ${worker.note ? `<p class="item-meta">备注：${h(worker.note)}</p>` : ""}
        <div class="tags">${worker.tags.map(item => tag(item)).join("")}</div>
        <div class="item" style="margin-top:12px">
          <strong>推荐岗位</strong>
          <span class="item-meta">${best ? `${h(best.demand.company)} · ${h(best.demand.role)}（${best.score}分）` : "暂无合适岗位"}</span>
        </div>
      </article>
    `;
  }).join("");
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
    source: "业务员录入"
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
    setFuzzyStatus(
      fuzzyItems.length
        ? `识别完成，共 ${fuzzyItems.length} 条，请检查后导入。`
        : `没有识别到可导入的${kindLabel}。`,
      !fuzzyItems.length
    );
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

function showAccountMessage(message, isError = false) {
  els.accountMessage.textContent = message;
  els.accountMessage.style.background = isError ? "#ffe9e9" : "#e5f5ec";
  els.accountMessage.style.color = isError ? "#8a2424" : "#0d5b38";
  els.accountMessage.classList.add("show");
}

document.querySelector("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    account = payload.account;
    localStorage.setItem("labor-account", JSON.stringify(account));
    data = payload.data;
    renderAccount();
    renderAll();
    showAccountMessage("注册并登录成功。");
  } catch (error) {
    showAccountMessage(error.message, true);
  }
});

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

document.querySelector("#logoutAccount").addEventListener("click", async () => {
  account = null;
  localStorage.removeItem("labor-account");
  // 退出后让所有视图回到 demo 状态
  data = { demands: [], workers: [], chat: [] };
  renderAccount();
  showAccountMessage("已退出登录。");
  await loadData();
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
  els.sideSummary.textContent = "后台服务未连接，请先启动 server.py。";
  els.metrics.innerHTML = `<article class="metric"><span>系统状态</span><strong>未连接</strong></article>`;
  els.chatLog.innerHTML = `<div class="bubble">后台服务未启动或接口异常：${escapeHtml(error.message)}</div>`;
});
