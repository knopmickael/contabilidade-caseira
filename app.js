"use strict";

/* ================= Estado e persistência ================= */

const MAX_ACTIVE_COLUMNS = 6;

let state = null;
let view = "active"; // "active" | "archived"
let saveTimer = null;

async function fetchState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error("Falha ao carregar estado: " + res.status);
  const parsed = await res.json();
  if (!parsed || !parsed.months || !parsed.categories) throw new Error("Estado inválido");
  return parsed;
}

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch(err => console.error("Falha ao salvar:", err));
  }, 250);
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ================= Datas ================= */

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function currentMonthKey() {
  return monthKey(new Date());
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1] + " " + y;
}

function nextMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + 1, 1);
  return monthKey(d);
}

function activeMonthKeys() {
  const ck = currentMonthKey();
  return Object.keys(state.months)
    .filter(k => k >= ck && !state.months[k].archived)
    .sort();
}

function archivedMonthKeys() {
  const ck = currentMonthKey();
  return Object.keys(state.months)
    .filter(k => k < ck || state.months[k].archived)
    .sort()
    .reverse();
}

function archiveMonth(key) {
  state.months[key].archived = true;
  saveState();
  render();
  toast(monthLabel(key) + " arquivado.");
}

function deleteMonth(key) {
  if (!confirm(`Excluir a coluna ${monthLabel(key)} e todos os seus gastos/entradas?`)) return;
  delete state.months[key];
  saveState();
  render();
  toast(monthLabel(key) + " excluído.");
}

/* ================= Dinheiro ================= */

function parseMoney(str) {
  if (typeof str === "number") return str;
  let s = String(str || "").trim().replace(/R\$\s?/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
});

function fmt(n) {
  return brl.format(n);
}

/* ================= Helpers de DOM ================= */

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div", "toast");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ================= Render do board ================= */

function render() {
  const board = document.getElementById("board");
  const scrollPositions = {};
  board.querySelectorAll(".expenses-scroll[data-month-key]").forEach(s => {
    scrollPositions[s.dataset.monthKey] = s.scrollTop;
  });
  board.innerHTML = "";

  const keys = view === "active" ? activeMonthKeys() : archivedMonthKeys();

  if (!keys.length) {
    board.appendChild(el("div", "empty-hint",
      view === "active" ? "Nenhum mês ativo." : "Nenhum mês arquivado ainda."));
  } else {
    keys.forEach(k => board.appendChild(renderColumn(k)));
  }

  board.querySelectorAll(".expenses-scroll[data-month-key]").forEach(s => {
    const pos = scrollPositions[s.dataset.monthKey];
    if (pos != null) s.scrollTop = pos;
  });

  document.getElementById("btnToggleView").textContent =
    view === "active" ? "Arquivados" : "Corrente";
  document.getElementById("btnToggleView").classList.toggle("active", view === "archived");

  const newMonthBtn = document.getElementById("btnNewMonth");
  newMonthBtn.disabled = view !== "active" || activeMonthKeys().length >= MAX_ACTIVE_COLUMNS;
}

function renderColumn(key) {
  const data = state.months[key];
  const col = el("div", "column");

  const header = el("div", "column-header");
  const titleWrap = el("div", "column-title");
  titleWrap.appendChild(el("span", null, monthLabel(key)));
  if (key === currentMonthKey()) {
    titleWrap.appendChild(el("span", "column-badge", "mês atual"));
  } else if (key < currentMonthKey() || data.archived) {
    titleWrap.appendChild(el("span", "column-badge", "arquivado"));
  }
  header.appendChild(titleWrap);

  const colActions = el("div", "column-actions");
  if (data.archived) {
    const unarchiveBtn = el("button", "icon-btn", "⤒");
    unarchiveBtn.title = "Restaurar para ativos";
    unarchiveBtn.onclick = () => {
      data.archived = false;
      saveState();
      render();
      toast(monthLabel(key) + " restaurado.");
    };
    colActions.appendChild(unarchiveBtn);
  } else if (key >= currentMonthKey()) {
    const archiveBtn = el("button", "icon-btn", "⤓");
    archiveBtn.title = "Arquivar coluna";
    archiveBtn.onclick = () => archiveMonth(key);
    colActions.appendChild(archiveBtn);
  }
  const delBtn = el("button", "icon-btn del", "🗑");
  delBtn.title = "Excluir coluna";
  delBtn.onclick = () => deleteMonth(key);
  colActions.appendChild(delBtn);
  header.appendChild(colActions);

  col.appendChild(header);

  col.appendChild(renderEntries(key, data));

  const addExpenseBtn = el("button", "add-expense-btn", "+ Novo gasto");
  addExpenseBtn.onclick = () => openExpenseModal(key, null);
  col.appendChild(addExpenseBtn);

  col.appendChild(renderExpenses(key, data));
  col.appendChild(renderFooter(key, data));
  return col;
}

/* ---------- Entradas (múltiplas) ---------- */

function renderEntries(key, data) {
  const section = el("div", "entries-section");

  const headRow = el("div", "entries-header");
  headRow.appendChild(el("h3", null, "Entradas (R$)"));

  const addBtn = el("button", "icon-btn add-entry-btn", "+");
  addBtn.title = "Adicionar entrada";
  addBtn.onclick = () => {
    if (section.querySelector(".entry-add-row")) return;

    const addRow = el("div", "entry-add-row");
    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.placeholder = "Nome (ex.: Salário)";
    const valueInput = el("input", "entry-value-input");
    valueInput.type = "text";
    valueInput.inputMode = "decimal";
    valueInput.placeholder = "0,00";

    const confirmBtn = el("button", "btn btn-primary", "+");
    confirmBtn.title = "Adicionar entrada";
    confirmBtn.onclick = () => {
      const value = parseMoney(valueInput.value);
      if (value <= 0) { toast("Informe um valor válido para a entrada."); valueInput.focus(); return; }
      data.entries.push({ id: uid(), name: nameInput.value.trim(), value });
      saveState();
      render();
    };
    const cancelBtn = el("button", "icon-btn del", "✕");
    cancelBtn.title = "Cancelar";
    cancelBtn.onclick = () => addRow.remove();

    valueInput.addEventListener("keydown", e => {
      if (e.key === "Enter") confirmBtn.click();
      if (e.key === "Escape") addRow.remove();
    });

    addRow.appendChild(nameInput);
    addRow.appendChild(valueInput);
    addRow.appendChild(confirmBtn);
    addRow.appendChild(cancelBtn);
    headRow.insertAdjacentElement("afterend", addRow);
    nameInput.focus();
  };
  headRow.appendChild(addBtn);
  section.appendChild(headRow);

  data.entries.forEach(entry => {
    const row = el("div", "entry-row");
    row.appendChild(el("span", "entry-name", entry.name || "Entrada"));
    row.appendChild(el("span", "entry-value", fmt(entry.value)));

    const edit = el("button", "icon-btn", "✎");
    edit.title = "Editar entrada";
    edit.onclick = () => {
      if (section.querySelector(".entry-add-row")) return;

      const editRow = el("div", "entry-add-row");
      const nameInput = el("input");
      nameInput.type = "text";
      nameInput.placeholder = "Nome (ex.: Salário)";
      nameInput.value = entry.name || "";
      const valueInput = el("input", "entry-value-input");
      valueInput.type = "text";
      valueInput.inputMode = "decimal";
      valueInput.value = String(entry.value).replace(".", ",");

      const confirmBtn = el("button", "btn btn-primary", "✓");
      confirmBtn.title = "Salvar";
      confirmBtn.onclick = () => {
        const value = parseMoney(valueInput.value);
        if (value <= 0) { toast("Informe um valor válido para a entrada."); valueInput.focus(); return; }
        entry.name = nameInput.value.trim();
        entry.value = value;
        saveState();
        render();
      };
      const cancelBtn = el("button", "icon-btn del", "✕");
      cancelBtn.title = "Cancelar";
      cancelBtn.onclick = () => render();

      valueInput.addEventListener("keydown", e => {
        if (e.key === "Enter") confirmBtn.click();
        if (e.key === "Escape") render();
      });

      editRow.appendChild(nameInput);
      editRow.appendChild(valueInput);
      editRow.appendChild(confirmBtn);
      editRow.appendChild(cancelBtn);
      row.insertAdjacentElement("afterend", editRow);
      row.remove();
      nameInput.focus();
    };

    const del = el("button", "icon-btn del", "✕");
    del.title = "Excluir entrada";
    del.onclick = () => {
      if (!confirm(`Excluir a entrada "${entry.name || "Entrada"}"?`)) return;
      data.entries = data.entries.filter(e => e.id !== entry.id);
      saveState();
      render();
    };
    row.appendChild(edit);
    row.appendChild(del);
    section.appendChild(row);
  });

  return section;
}

/* ---------- Gastos (agrupados por categoria, recursivo) ---------- */

function sortExpenses(list) {
  return list.slice().sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
      sensitivity: "base",
      numeric: true,
    })
  );
}

function renderExpenses(key, data) {
  const scroll = el("div", "expenses-scroll");
  scroll.dataset.monthKey = key;

  if (!data.expenses.length) {
    scroll.appendChild(el("div", "empty-hint", "Nenhum gasto registrado."));
  } else {
    const uncategorized = data.expenses.filter(e => !e.catId);
    sortExpenses(uncategorized).forEach(e => scroll.appendChild(renderExpenseItem(key, e, true)));

    state.categories.forEach(cat => {
      const catExpenses = data.expenses.filter(e => e.catId === cat.id);
      if (catExpenses.length) {
        scroll.appendChild(renderGroup(key, catExpenses, cat.name, cat.subs, 0, cat.id));
      }
    });
  }

  return scroll;
}

function renderGroup(key, expenses, name, subs, level = 0, catId = null) {
  const wrapper = el("div", "cat-wrapper lvl-" + (level % 3));
  const total = expenses.reduce((s, e) => s + (e.disabled ? 0 : e.value), 0);

  if (level === 0 && catId) setupCategoryDrag(wrapper, catId);

  const header = el("div", "cat-wrapper-header");
  header.appendChild(el("span", null, name));
  header.appendChild(el("span", "cat-total", fmt(total)));
  header.onclick = () => wrapper.classList.toggle("collapsed");
  wrapper.appendChild(header);

  const body = el("div", "cat-wrapper-body");
  const validSubs = (subs || []).filter(s => expenses.some(e => e.sub === s));

  if (validSubs.length) {
    sortExpenses(expenses.filter(e => !e.sub || !validSubs.includes(e.sub)))
      .forEach(e => body.appendChild(renderExpenseItem(key, e)));
    validSubs.forEach(sub => {
      const subExpenses = expenses.filter(e => e.sub === sub);
      body.appendChild(renderGroup(key, subExpenses, sub, null, level + 1));
    });
  } else {
    sortExpenses(expenses).forEach(e => body.appendChild(renderExpenseItem(key, e)));
  }

  wrapper.appendChild(body);
  return wrapper;
}

let dragInfo = null;

function clearDropTargets() {
  document.querySelectorAll(".drop-target").forEach(n => n.classList.remove("drop-target"));
}

function setupCategoryDrag(wrapper, catId) {
  wrapper.draggable = true;
  wrapper.classList.add("draggable-cat");

  wrapper.addEventListener("dragstart", e => {
    dragInfo = { type: "category", catId };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", catId);
    requestAnimationFrame(() => wrapper.classList.add("dragging"));
  });
  wrapper.addEventListener("dragend", () => {
    wrapper.classList.remove("dragging");
    dragInfo = null;
    clearDropTargets();
  });
  wrapper.addEventListener("dragover", e => {
    if (!dragInfo || dragInfo.type !== "category" || dragInfo.catId === catId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    wrapper.classList.add("drop-target");
  });
  wrapper.addEventListener("dragleave", e => {
    if (!wrapper.contains(e.relatedTarget)) wrapper.classList.remove("drop-target");
  });
  wrapper.addEventListener("drop", e => {
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("drop-target");
    if (!dragInfo || dragInfo.type !== "category" || dragInfo.catId === catId) return;

    const cats = state.categories;
    const fromIdx = cats.findIndex(c => c.id === dragInfo.catId);
    if (fromIdx === -1) return;
    const [moved] = cats.splice(fromIdx, 1);
    const toIdx = cats.findIndex(c => c.id === catId);
    cats.splice(toIdx, 0, moved);
    saveState();
    render();
  });
}

function renderExpenseItem(key, expense, draggable = false) {
  const item = el("div", "expense-item" + (expense.disabled ? " disabled" : ""));
  item.appendChild(el("span", "exp-name", expense.name));

  const cat = expense.catId ? state.categories.find(c => c.id === expense.catId) : null;
  if (cat && cat.name === "Mercado") {
    const vaTag = el("button", "exp-va-tag" + (expense.va ? " active" : ""), "VA");
    vaTag.type = "button";
    vaTag.title = expense.va
      ? "Pago com VA — clicar para desativar"
      : "Marcar como pago com VA";
    vaTag.onclick = e => {
      e.stopPropagation();
      expense.va = !expense.va;
      saveState();
      render();
    };
    item.appendChild(vaTag);
  }

  const eye = el("button", "icon-btn exp-eye-btn" + (expense.disabled ? " off" : ""), "👁");
  eye.type = "button";
  eye.title = expense.disabled
    ? "Habilitar gasto (incluir na soma)"
    : "Desabilitar gasto (excluir da soma)";
  eye.onclick = e => {
    e.stopPropagation();
    toggleExpenseDisabled(key, expense);
  };
  item.appendChild(eye);

  if (expense.inst) {
    item.appendChild(el("span", "inst-tag", `[${expense.inst.i}/${expense.inst.total}]`));
  }

  item.appendChild(el("span", "exp-value", fmt(expense.value)));

  if (draggable) {
    item.draggable = true;

    item.addEventListener("dragstart", e => {
      e.stopPropagation();
      dragInfo = { type: "expense", monthKey: key, expenseId: expense.id };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", expense.id);
      requestAnimationFrame(() => item.classList.add("dragging"));
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      dragInfo = null;
      clearDropTargets();
    });
    item.addEventListener("dragover", e => {
      if (!dragInfo || dragInfo.type !== "expense") return;
      if (dragInfo.expenseId === expense.id || dragInfo.monthKey !== key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      item.classList.add("drop-target");
    });
    item.addEventListener("dragleave", e => {
      if (!item.contains(e.relatedTarget)) item.classList.remove("drop-target");
    });
    item.addEventListener("drop", e => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove("drop-target");
      if (!dragInfo || dragInfo.type !== "expense") return;
      if (dragInfo.expenseId === expense.id || dragInfo.monthKey !== key) return;

      const arr = state.months[key].expenses;
      const fromIdx = arr.findIndex(x => x.id === dragInfo.expenseId);
      if (fromIdx === -1) return;
      const [moved] = arr.splice(fromIdx, 1);
      const toIdx = arr.findIndex(x => x.id === expense.id);
      arr.splice(toIdx, 0, moved);
      saveState();
      render();
    });
  }

  const actions = el("div", "exp-item-actions");

  const edit = el("button", "icon-btn", "✎");
  edit.title = "Editar gasto";
  edit.onclick = () => openExpenseModal(key, expense.id);

  const del = el("button", "icon-btn del", "✕");
  del.title = "Excluir gasto";
  del.onclick = () => {
    if (!confirm(`Excluir o gasto "${expense.name}"?`)) return;
    const data = state.months[key];
    data.expenses = data.expenses.filter(e => e.id !== expense.id);
    saveState();
    render();
  };

  actions.appendChild(edit);
  actions.appendChild(del);
  item.appendChild(actions);
  return item;
}

/* ---------- Desabilitar/habilitar gasto ---------- */

let installmentToggleTarget = null;

function toggleExpenseDisabled(key, expense) {
  if (expense.inst) {
    openInstallmentToggleModal(key, expense);
    return;
  }
  expense.disabled = !expense.disabled;
  saveState();
  render();
}

function openInstallmentToggleModal(key, expense) {
  const disabled = !expense.disabled;
  installmentToggleTarget = { key, expense, disabled };
  const action = disabled ? "desabilitar" : "habilitar";

  document.getElementById("instToggleTitle").textContent =
    (disabled ? "Desabilitar" : "Habilitar") + " gasto parcelado";
  document.getElementById("instToggleText").textContent =
    `"${expense.name}" é a parcela ${expense.inst.i}/${expense.inst.total}. ` +
    `Deseja ${action} todas as parcelas ou apenas esta?`;
  document.getElementById("btnInstToggleOne").textContent =
    (disabled ? "Desabilitar" : "Habilitar") + " esta";
  document.getElementById("btnInstToggleAll").textContent =
    (disabled ? "Desabilitar" : "Habilitar") + " todas";
  document.getElementById("instToggleModal").classList.remove("hidden");
}

function closeInstallmentToggleModal() {
  installmentToggleTarget = null;
  document.getElementById("instToggleModal").classList.add("hidden");
}

function applyInstallmentToggle(all) {
  const target = installmentToggleTarget;
  if (!target) return;
  const { expense, disabled } = target;

  if (all && expense.inst) {
    Object.values(state.months).forEach(m => {
      m.expenses.forEach(e => {
        if (e.inst && e.inst.sid === expense.inst.sid) e.disabled = disabled;
      });
    });
  } else {
    expense.disabled = disabled;
  }

  closeInstallmentToggleModal();
  saveState();
  render();
  toast(disabled ? "Gasto desabilitado." : "Gasto habilitado.");
}

/* ---------- Rodapé: restante ---------- */

function renderFooter(key, data) {
  const footer = el("div", "column-footer");
  const totalIn = data.entries.reduce((s, e) => s + e.value, 0);
  const vaOut = data.expenses.filter(e => e.va && !e.disabled).reduce((s, e) => s + e.value, 0);
  const totalOut = data.expenses.filter(e => !e.va && !e.disabled).reduce((s, e) => s + e.value, 0);
  const va = typeof data.va === "number" ? data.va : 0;
  const rest = totalIn - totalOut;
  const vaRest = va - vaOut;

  footer.appendChild(el("div", "footer-label", `Entradas ${fmt(totalIn)} · Gastos ${fmt(totalOut)}`));
  const value = el("div", "footer-value " + (rest < 0 ? "negative" : "positive"));
  value.appendChild(document.createTextNode("Restante: " + fmt(rest)));
  footer.appendChild(value);

  const vaLine = el("div", "footer-va " + (vaRest < 0 ? "negative" : "positive"));
  vaLine.appendChild(document.createTextNode("VA restante: " + fmt(vaRest)));
  if (vaOut > 0) {
    vaLine.appendChild(el("span", "va-used", ` (− ${fmt(vaOut)} em gastos VA)`));
  }
  footer.appendChild(vaLine);

  const vaForm = el("form", "footer-va-value");
  const vaLabel = el("label", null, "VA do mês (R$)");
  const vaInput = el("input", "va-input");
  vaInput.type = "text";
  vaInput.inputMode = "decimal";
  vaInput.value = String(va).replace(".", ",");
  vaInput.setAttribute("aria-label", `VA de ${monthLabel(key)} (R$)`);
  vaLabel.appendChild(vaInput);
  const vaSave = el("button", "btn btn-ghost", "Salvar VA");
  vaSave.type = "submit";
  vaForm.append(vaLabel, vaSave);
  vaForm.onsubmit = event => {
    event.preventDefault();
    const raw = vaInput.value.trim().replace(/R\$\s?/g, "");
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const amount = Number(normalized);
    if (!raw || !Number.isFinite(amount) || amount < 0) {
      vaInput.setCustomValidity("Informe um valor de VA válido, maior ou igual a zero.");
      vaInput.reportValidity();
      return;
    }
    data.va = amount;
    saveState();
    render();
    document.querySelector(`.va-input[aria-label="VA de ${monthLabel(key)} (R$)"]`).focus();
    toast("VA de " + monthLabel(key) + " atualizado.");
  };
  vaInput.oninput = () => vaInput.setCustomValidity("");
  vaInput.onkeydown = event => {
    if (event.key === "Escape") {
      vaInput.value = String(va).replace(".", ",");
      vaInput.setCustomValidity("");
    }
  };
  footer.appendChild(vaForm);
  return footer;
}

/* ================= Modal de gasto ================= */

function openExpenseModal(monthKey_, expenseId) {
  const data = state.months[monthKey_];
  const expense = expenseId ? data.expenses.find(e => e.id === expenseId) : null;

  document.getElementById("expenseModalTitle").textContent =
    expense ? "Editar gasto" : "Novo gasto";
  document.getElementById("expenseId").value = expense ? expense.id : "";
  document.getElementById("expenseMonthKey").value = monthKey_;
  document.getElementById("expenseName").value = expense ? expense.name : "";
  document.getElementById("expenseValue").value = expense ? String(expense.value).replace(".", ",") : "";

  setupReplicateSection(expense, monthKey_);
  setupInstallmentSection(expense, monthKey_);

  populateCategorySelect(expense ? expense.catId : null, expense ? expense.sub : null);

  document.getElementById("expenseModal").classList.remove("hidden");
  document.getElementById("expenseName").focus();
}

function setupReplicateSection(expense, monthKey_) {
  const section = document.getElementById("replicateSection");
  const check = document.getElementById("expenseReplicate");
  const list = document.getElementById("replicateMonths");

  if (expense) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  check.checked = false;
  list.innerHTML = "";
  list.classList.add("hidden");

  const others = activeMonthKeys().filter(k => k !== monthKey_);
  if (!others.length) {
    section.classList.add("hidden");
    return;
  }

  others.forEach(k => {
    const row = el("label", "replicate-month");
    const cb = el("input");
    cb.type = "checkbox";
    cb.value = k;
    cb.className = "replicate-month-cb";
    row.appendChild(cb);
    row.appendChild(el("span", null, monthLabel(k)));
    list.appendChild(row);
  });

  check.onchange = () => list.classList.toggle("hidden", !check.checked);
}

function setupInstallmentSection(expense, monthKey_) {
  const section = document.getElementById("installmentSection");
  const check = document.getElementById("expenseInst");
  const wrap = document.getElementById("instCountWrap");
  const totalInput = document.getElementById("expenseInstTotal");
  const startInput = document.getElementById("expenseInstStart");

  if (expense) {
    section.classList.add("hidden");
    check.checked = false;
    wrap.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  check.checked = false;
  wrap.classList.add("hidden");
  totalInput.value = "12";
  startInput.value = "1";

  check.onchange = () => {
    wrap.classList.toggle("hidden", !check.checked);
    const repSection = document.getElementById("replicateSection");
    const repCheck = document.getElementById("expenseReplicate");
    const repList = document.getElementById("replicateMonths");
    if (check.checked) {
      repSection.classList.add("hidden");
      repCheck.checked = false;
      repList.classList.add("hidden");
    } else {
      setupReplicateSection(null, monthKey_);
    }
  };
}

function populateCategorySelect(selectedCatId, selectedSub) {
  const catSel = document.getElementById("expenseCategory");
  catSel.innerHTML = "";

  const none = el("option", null, "Sem categoria");
  none.value = "";
  catSel.appendChild(none);

  state.categories.forEach(c => {
    const o = el("option", null, c.name);
    o.value = c.id;
    catSel.appendChild(o);
  });

  const novo = el("option", null, "＋ Nova categoria…");
  novo.value = "__new__";
  catSel.appendChild(novo);

  catSel.value = selectedCatId || "";
  catSel.onchange = () => {
    if (catSel.value === "__new__") {
      const name = prompt("Nome da nova categoria:");
      if (name && name.trim()) {
        const cat = { id: uid(), name: name.trim(), subs: [] };
        state.categories.push(cat);
        saveState();
        catSel.value = cat.id;
      } else {
        catSel.value = selectedCatId || "";
      }
    }
    populateSubSelect(catSel.value, null);
  };

  populateSubSelect(catSel.value, selectedSub);
}

function populateSubSelect(catId, selectedSub) {
  const subWrap = document.getElementById("subWrap");
  const subSel = document.getElementById("expenseSub");
  subSel.innerHTML = "";

  const cat = state.categories.find(c => c.id === catId);
  if (!cat) {
    subWrap.style.display = "none";
    return;
  }
  subWrap.style.display = "";

  const none = el("option", null, "Sem subcategoria");
  none.value = "";
  subSel.appendChild(none);

  cat.subs.forEach(s => {
    const o = el("option", null, s);
    o.value = s;
    subSel.appendChild(o);
  });

  const novo = el("option", null, "＋ Nova subcategoria…");
  novo.value = "__new__";
  subSel.appendChild(novo);

  subSel.value = selectedSub && cat.subs.includes(selectedSub) ? selectedSub : "";

  subSel.onchange = () => {
    if (subSel.value === "__new__") {
      const name = prompt(`Nova subcategoria de "${cat.name}":`);
      if (name && name.trim()) {
        if (!cat.subs.includes(name.trim())) cat.subs.push(name.trim());
        saveState();
        subSel.value = name.trim();
      } else {
        subSel.value = "";
      }
    }
  };
}

function saveExpenseFromModal() {
  const id = document.getElementById("expenseId").value;
  const key = document.getElementById("expenseMonthKey").value;
  const name = document.getElementById("expenseName").value.trim();
  const value = parseMoney(document.getElementById("expenseValue").value);
  const catId = document.getElementById("expenseCategory").value || null;
  const subSel = document.getElementById("expenseSub");
  const sub = catId && subSel.value && subSel.value !== "__new__" ? subSel.value : null;

  if (!name) { toast("Informe o nome do gasto."); return; }
  if (value <= 0) { toast("Informe um valor válido."); return; }

  const data = state.months[key];
  if (id) {
    const exp = data.expenses.find(e => e.id === id);
    if (exp) Object.assign(exp, { name, value, catId, sub });
  } else {
    const instCheck = document.getElementById("expenseInst");
    if (instCheck && instCheck.checked) {
      let total = parseInt(document.getElementById("expenseInstTotal").value, 10);
      let start = parseInt(document.getElementById("expenseInstStart").value, 10);
      if (!Number.isFinite(total) || total < 1) {
        toast("Informe o número de parcelas.");
        return;
      }
      if (!Number.isFinite(start) || start < 1) {
        toast("Informe a parcela atual.");
        return;
      }
      total = Math.min(total, 120);
      if (start > total) {
        toast("A parcela atual não pode ser maior que o total de parcelas.");
        return;
      }

      const sid = uid();
      const startKey = key;
      let current = start;
      data.expenses.push({
        id: uid(), name, value, catId, sub, va: false,
        inst: { i: start, total, sid, startKey },
      });

      const subsequent = Object.keys(state.months).filter(k => k > startKey).sort();
      for (const k of subsequent) {
        if (current >= total) break;
        current++;
        state.months[k].expenses.push({
          id: uid(), name, value, catId, sub, va: false,
          inst: { i: current, total, sid, startKey },
        });
      }

      if (current < total) {
        toast(`Parcelado criado: ${current}/${total} — sem mais meses cadastrados.`);
      }
    } else {
      const replicateCheck = document.getElementById("expenseReplicate");
      const replicateList = document.getElementById("replicateMonths");
      const targets = replicateCheck && replicateCheck.checked && replicateList
        ? Array.from(replicateList.querySelectorAll(".replicate-month-cb:checked")).map(cb => cb.value)
        : [];

      const seriesId = targets.length ? uid() : null;
      data.expenses.push({ id: uid(), name, value, catId, sub, va: false, seriesId });

      let replicated = 0;
      targets.forEach(k => {
        const target = state.months[k];
        if (!target) return;
        target.expenses.push({ id: uid(), name, value, catId, sub, va: false, seriesId });
        replicated++;
      });
      if (replicated) {
        toast(`Gasto replicado em ${replicated} ${replicated === 1 ? "mês" : "meses"}.`);
      }
    }
  }
  saveState();
  closeExpenseModal();
  render();
}

function closeExpenseModal() {
  document.getElementById("expenseModal").classList.add("hidden");
}

/* ================= Modal de categorias ================= */

function renderCategoryModal() {
  const list = document.getElementById("categoryList");
  list.innerHTML = "";

  if (!state.categories.length) {
    list.appendChild(el("div", "empty-hint", "Nenhuma categoria."));
  }

  state.categories.forEach(cat => {
    const item = el("div", "cat-item");

    const head = el("div", "cat-item-header");
    head.appendChild(el("span", "cat-name", cat.name));

    const addSub = el("button", "icon-btn", "+ sub");
    addSub.title = "Adicionar subcategoria";
    addSub.onclick = () => {
      const name = prompt(`Nova subcategoria de "${cat.name}":`);
      if (name && name.trim() && !cat.subs.includes(name.trim())) {
        cat.subs.push(name.trim());
        saveState();
        renderCategoryModal();
      }
    };

    const rename = el("button", "icon-btn", "✎");
    rename.title = "Renomear";
    rename.onclick = () => {
      const name = prompt("Novo nome da categoria:", cat.name);
      if (name && name.trim()) { cat.name = name.trim(); saveState(); renderCategoryModal(); render(); }
    };

    const del = el("button", "icon-btn del", "✕");
    del.title = "Excluir categoria";
    del.onclick = () => {
      if (!confirm(`Excluir a categoria "${cat.name}"? Os gastos dela ficarão sem categoria.`)) return;
      state.categories = state.categories.filter(c => c.id !== cat.id);
      Object.values(state.months).forEach(m => {
        m.expenses.forEach(e => { if (e.catId === cat.id) { e.catId = null; e.sub = null; } });
      });
      saveState();
      renderCategoryModal();
      render();
    };

    head.appendChild(addSub);
    head.appendChild(rename);
    head.appendChild(del);
    item.appendChild(head);

    if (cat.subs.length) {
      const subs = el("div", "subs-list");
      cat.subs.forEach(sub => {
        const row = el("div", "sub-item");
        row.appendChild(el("span", "sub-name", sub));

        const renameSub = el("button", "icon-btn", "✎");
        renameSub.title = "Renomear subcategoria";
        renameSub.onclick = () => {
          const name = prompt("Novo nome da subcategoria:", sub);
          if (!name || !name.trim()) return;
          const trimmed = name.trim();
          if (trimmed === sub || cat.subs.includes(trimmed)) return;
          cat.subs = cat.subs.map(s => s === sub ? trimmed : s);
          Object.values(state.months).forEach(m => {
            m.expenses.forEach(e => { if (e.sub === sub) e.sub = trimmed; });
          });
          saveState();
          renderCategoryModal();
          render();
        };

        const delSub = el("button", "icon-btn del", "✕");
        delSub.onclick = () => {
          cat.subs = cat.subs.filter(s => s !== sub);
          Object.values(state.months).forEach(m => {
            m.expenses.forEach(e => { if (e.sub === sub) e.sub = null; });
          });
          saveState();
          renderCategoryModal();
          render();
        };

        row.appendChild(renameSub);
        row.appendChild(delSub);
        subs.appendChild(row);
      });
      item.appendChild(subs);
    }

    list.appendChild(item);
  });
}

/* ================= Abrir novo mês (duplicar última coluna) ================= */

function duplicateExpensesForNewMonth(srcExpenses) {
  return srcExpenses
    .map(e => ({ ...e, id: uid() }))
    .filter(e => {
      if (!e.inst) return true;
      if (e.inst.i >= e.inst.total) return false;
      e.inst = { ...e.inst, i: e.inst.i + 1 };
      return true;
    });
}

function openNewMonth() {
  const actives = activeMonthKeys();

  if (!actives.length) {
    const ck = currentMonthKey();
    if (state.months[ck]) {
      state.months[ck].archived = false;
    } else {
      const allKeys = Object.keys(state.months).sort();
      const src = allKeys.length ? state.months[allKeys[allKeys.length - 1]] : { entries: [], expenses: [] };
      state.months[ck] = {
        va: typeof src.va === "number" ? src.va : 703,
        entries: src.entries.map(e => ({ ...e, id: uid() })),
        expenses: duplicateExpensesForNewMonth(src.expenses),
      };
    }
    saveState();
    render();
    toast(monthLabel(ck) + " recriado.");
    return;
  }

  if (actives.length >= MAX_ACTIVE_COLUMNS) {
    toast("Limite de " + MAX_ACTIVE_COLUMNS + " meses ativos atingido.");
    return;
  }
  const lastKey = actives[actives.length - 1];
  const newKey = nextMonthKey(lastKey);

  if (state.months[newKey]) {
    toast(monthLabel(newKey) + " já existe.");
    return;
  }

  const src = state.months[lastKey] || { entries: [], expenses: [] };
  state.months[newKey] = {
    va: typeof src.va === "number" ? src.va : 703,
    entries: src.entries.map(e => ({ ...e, id: uid() })),
    expenses: duplicateExpensesForNewMonth(src.expenses),
  };
  saveState();
  render();
  toast(monthLabel(newKey) + " criado (duplicado de " + monthLabel(lastKey) + ").");

  const board = document.getElementById("board");
  board.scrollTo({ left: board.scrollWidth, behavior: "smooth" });
}

/* ================= Migração automática de mês ================= */

let lastKnownMonth = currentMonthKey();

function checkMonthRollover() {
  const ck = currentMonthKey();
  if (ck !== lastKnownMonth) {
    lastKnownMonth = ck;
    render();
    toast("Novo mês detectado: " + monthLabel(ck) + ". Colunas anteriores arquivadas.");
  }
}

/* ================= Tema (Frutiger Aero / Neon) ================= */

const THEME_KEY = "contabilidade-theme";
const THEME_LABELS = { aero: "Frutiger Aero", neon: "Neon" };

function currentTheme() {
  const t = localStorage.getItem(THEME_KEY);
  return t === "neon" || t === "aero" ? t : "aero";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById("btnTheme");
  if (!btn) return;
  const label = "Alternar tema (atual: " + THEME_LABELS[theme] + ")";
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

/* ================= Eventos e init ================= */

applyTheme(currentTheme());

document.getElementById("btnTheme").onclick = () => {
  applyTheme(currentTheme() === "aero" ? "neon" : "aero");
};

document.getElementById("btnNewMonth").onclick = openNewMonth;

document.getElementById("btnToggleView").onclick = () => {
  view = view === "active" ? "archived" : "active";
  render();
};

document.getElementById("expenseSave").onclick = saveExpenseFromModal;
document.getElementById("expenseCancel").onclick = closeExpenseModal;

document.getElementById("btnInstToggleCancel").onclick = closeInstallmentToggleModal;
document.getElementById("btnInstToggleOne").onclick = () => applyInstallmentToggle(false);
document.getElementById("btnInstToggleAll").onclick = () => applyInstallmentToggle(true);

document.getElementById("btnCategories").onclick = () => {
  renderCategoryModal();
  document.getElementById("categoryModal").classList.remove("hidden");
};
document.getElementById("categoryClose").onclick = () => {
  document.getElementById("categoryModal").classList.add("hidden");
};
document.getElementById("btnAddCategory").onclick = () => {
  const input = document.getElementById("newCategoryName");
  const name = input.value.trim();
  if (!name) return;
  if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    toast("Categoria já existe.");
    return;
  }
  state.categories.push({ id: uid(), name, subs: [] });
  input.value = "";
  saveState();
  renderCategoryModal();
};
document.getElementById("newCategoryName").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("btnAddCategory").click();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeExpenseModal();
    closeInstallmentToggleModal();
    document.getElementById("categoryModal").classList.add("hidden");
  }
});

async function init() {
  try {
    state = await fetchState();
  } catch (err) {
    console.error(err);
    toast("Erro ao carregar dados do servidor.");
    return;
  }
  if (!Object.keys(state.months).length) {
    state.months[currentMonthKey()] = { va: 703, entries: [], expenses: [] };
    saveState();
  }
  render();
  setInterval(checkMonthRollover, 30000);
}

init();
