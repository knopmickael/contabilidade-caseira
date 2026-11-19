"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadApp(values = new Map()) {
  const elements = [];
  function element(tag) {
    const node = {
      tag, children: [], value: "", validityMessage: "",
      classList: { add() {}, remove() {} },
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { this.children.push(...children); },
      setAttribute(name, value) { this[name] = value; },
      setCustomValidity(message) { this.validityMessage = message; },
      reportValidity() {}, focus() {}, scrollTo() {},
    };
    elements.push(node);
    return node;
  }
  const context = vm.createContext({
    console: { error() {} }, Intl, Date, crypto: require("node:crypto").webcrypto,
    setTimeout, clearTimeout,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    document: {
      createElement: element, createTextNode: text => ({ text }),
      querySelector: () => element("div"),
      getElementById: () => element("div"), body: element("body"),
    },
  });
  const source = fs.readFileSync("app.js", "utf8").split("applyTheme(currentTheme());")[0];
  vm.runInContext(source, context);
  return { context, elements, values, run: code => vm.runInContext(code, context) };
}

test("VA personalizado é herdado e pode ser alterado independentemente, inclusive para zero", () => {
  const app = loadApp();
  app.run(`
    state = { categories: [], months: {} };
    state.months[currentMonthKey()] = { va: 850.50, entries: [], expenses: [] };
    saveState = () => {};
    render = () => {};
    toast = () => {};
    openNewMonth();
  `);
  assert.equal(app.run("state.months[nextMonthKey(currentMonthKey())].va"), 850.5);
  app.run("renderFooter(currentMonthKey(), state.months[currentMonthKey()])");
  const input = app.elements.find(e => e.className === "va-input");
  const form = app.elements.find(e => e.tag === "form");
  input.value = "1.234,56";
  form.onsubmit({ preventDefault() {} });
  assert.equal(app.run("state.months[currentMonthKey()].va"), 1234.56);
  assert.equal(app.run("state.months[nextMonthKey(currentMonthKey())].va"), 850.5);
  input.value = "-10";
  form.onsubmit({ preventDefault() {} });
  assert.ok(input.validityMessage);
  assert.equal(app.run("state.months[currentMonthKey()].va"), 1234.56);
  input.value = "0";
  input.oninput();
  form.onsubmit({ preventDefault() {} });
  assert.equal(app.run("state.months[currentMonthKey()].va"), 0);
});

module.exports = { loadApp };

test("localStorage mantém o estado em novas sessões e só começa vazio quando a chave não existe", () => {
  const app = loadApp();
  assert.equal(app.run("loadState().categories.length"), 0);
  app.run("state = { categories: [], months: { '2026-11': { va: 987.65, entries: [], expenses: [] } } }; saveState()");
  assert.equal(app.run("loadState().months['2026-11'].va"), 987.65);
  assert.ok(app.values.has("contabilidade:state:v1"));
  const nextSession = loadApp(app.values);
  assert.equal(nextSession.run("loadState().months['2026-11'].va"), 987.65);
});

test("estado corrompido não é substituído silenciosamente por dados vazios", () => {
  const app = loadApp();
  app.values.set("contabilidade:state:v1", "{quebrado");
  assert.throws(() => app.run("loadState()"), { name: "SyntaxError" });
  assert.equal(app.values.get("contabilidade:state:v1"), "{quebrado");
  app.values.set("contabilidade:state:v1", '{"categories": [], "months": []}');
  assert.throws(() => app.run("loadState()"), /Estado local inválido/);
});

test("falha de armazenamento é sinalizada e mantém o estado em memória", () => {
  const app = loadApp();
  app.run("state = { categories: [], months: {} }; localStorage.setItem = () => { throw new Error('QuotaExceededError'); }");
  assert.equal(app.run("saveState()"), false);
  assert.equal(app.run("state.categories.length"), 0);
  assert.ok(app.elements.some(e => e.textContent?.includes("Não foi possível salvar")));
});
