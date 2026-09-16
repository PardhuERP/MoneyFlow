/* =========================================================
   MONEYFLOW — APP.JS
   Frontend controller
   HTML + CSS + Google Apps Script + Google Sheets
   ========================================================= */

const CONFIG = {
  // 🔴 STEP 4A:
  // Replace this with your deployed Google Apps Script Web App URL.
  API_URL: "https://script.google.com/macros/s/AKfycbxWbhji9ymacm2tmbYxybsBm9xrWtrPVECym8RgAeFPPOWp4eQurH-aViLQtOw15lY/exec",

  APP_NAME: "MoneyFlow",
  CURRENCY: "₹",

  STORAGE_KEY: "moneyflow_state_v1",
  THEME_KEY: "moneyflow_theme"
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

const state = {
  currentPage: "dashboard",

  selectedMonth: new Date().getMonth() + 1,
  selectedYear: new Date().getFullYear(),

  dashboard: null,
  budget: [],
  expenses: [],
  categories: [],
  settings: {},

  setupComplete: false,

  loading: false,
  online: navigator.onLine
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const mainContent = () => $("#mainContent");
const modalContainer = () => $("#modalContainer");
const toastElement = () => $("#toast");


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", init);

async function init() {

  loadLocalState();

  applySavedTheme();

  setupNavigation();

  setupGlobalButtons();

  updateMonthLabel();

  if (!state.setupComplete) {
    showSetupWizard();
  }

  await loadInitialData();

  renderCurrentPage();

}


/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function loadLocalState() {

  try {

    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);

    if (!saved) return;

    const parsed = JSON.parse(saved);

    Object.assign(state, parsed);

    state.online = navigator.onLine;

  } catch (error) {

    console.error("Local state error:", error);

  }

}


function saveLocalState() {

  try {

    const data = {
      currentPage: state.currentPage,
      selectedMonth: state.selectedMonth,
      selectedYear: state.selectedYear,
      dashboard: state.dashboard,
      budget: state.budget,
      expenses: state.expenses,
      categories: state.categories,
      settings: state.settings,
      setupComplete: state.setupComplete
    };

    localStorage.setItem(
      CONFIG.STORAGE_KEY,
      JSON.stringify(data)
    );

  } catch (error) {

    console.error("Save state error:", error);

  }

}


/* =========================================================
   ONLINE / OFFLINE
   ========================================================= */

window.addEventListener("online", async () => {

  state.online = true;

  showToast("Back online. Syncing...", "success");

  await loadInitialData();

  renderCurrentPage();

});


window.addEventListener("offline", () => {

  state.online = false;

  showToast("Offline mode enabled", "warning");

});


/* =========================================================
   API
   ========================================================= */

async function api(action, data = {}) {

  if (
    !CONFIG.API_URL ||
    CONFIG.API_URL.includes("https://script.google.com/macros/s/AKfycbxWbhji9ymacm2tmbYxybsBm9xrWtrPVECym8RgAeFPPOWp4eQurH-aViLQtOw15lY/exec")
  ) {

    throw new Error(
      "Apps Script API URL is not configured."
    );

  }


  const payload = {
    action,
    ...data
  };


  const response = await fetch(CONFIG.API_URL, {

    method: "POST",

    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },

    body: JSON.stringify(payload)

  });


  if (!response.ok) {

    throw new Error(
      `Server error: ${response.status}`
    );

  }


  const result = await response.json();


  if (result.success === false) {

    throw new Error(
      result.message || "API request failed"
    );

  }


  return result.data !== undefined
    ? result.data
    : result;

}


/* =========================================================
   INITIAL DATA
   ========================================================= */

async function loadInitialData() {

  try {

    state.loading = true;

    const data = await api("getDashboard", {
      month: state.selectedMonth,
      year: state.selectedYear
    });


    if (data) {

      state.dashboard = data;

      state.expenses = data.expenses || state.expenses;

    }


    try {

      state.categories = await api("getCategories");

    } catch (e) {

      state.categories = state.categories || [];

    }


    try {

      state.settings = await api("getSettings");

    } catch (e) {

      state.settings = state.settings || {};

    }


    try {

      state.budget = await api("getMonthlyBudget", {
        month: state.selectedMonth,
        year: state.selectedYear
      });

    } catch (e) {

      state.budget = state.budget || [];

    }


    saveLocalState();

  } catch (error) {

    console.warn("Using local/offline data:", error);

    showToast(
      "Using saved data. Server unavailable.",
      "warning"
    );

  } finally {

    state.loading = false;

  }

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  $$(".nav-item").forEach(button => {

    button.addEventListener("click", () => {

      const page = button.dataset.page;

      if (!page) return;

      state.currentPage = page;

      saveLocalState();

      renderCurrentPage();

    });

  });

}


function renderCurrentPage() {

  updateNavigation();

  updateMonthLabel();

  switch (state.currentPage) {

    case "dashboard":
      renderDashboard();
      break;

    case "expenses":
      renderExpensesPage();
      break;

    case "budget":
      renderBudgetPage();
      break;

    case "insights":
      renderInsightsPage();
      break;

    case "settings":
      renderSettingsPage();
      break;

    default:
      renderDashboard();

  }

}


function updateNavigation() {

  $$(".nav-item").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.page === state.currentPage
    );

  });

}


/* =========================================================
   GLOBAL BUTTONS
   ========================================================= */

function setupGlobalButtons() {

  const addButton = $("#addExpenseButton");

  if (addButton) {

    addButton.addEventListener(
      "click",
      () => showExpenseModal()
    );

  }


  const themeButton = $("#themeButton");

  if (themeButton) {

    themeButton.addEventListener(
      "click",
      toggleTheme
    );

  }


  const settingsButton = $("#settingsButton");

  if (settingsButton) {

    settingsButton.addEventListener("click", () => {

      state.currentPage = "settings";

      renderCurrentPage();

    });

  }

}


/* =========================================================
   MONTH
   ========================================================= */

function updateMonthLabel() {

  const element = $("#currentMonth");

  if (!element) return;

  const date = new Date(
    state.selectedYear,
    state.selectedMonth - 1,
    1
  );

  element.textContent = date.toLocaleDateString(
    "en-IN",
    {
      month: "long",
      year: "numeric"
    }
  );

}


function changeMonth(direction) {

  let month = state.selectedMonth + direction;
  let year = state.selectedYear;

  if (month > 12) {

    month = 1;
    year++;

  }

  if (month < 1) {

    month = 12;
    year--;

  }

  state.selectedMonth = month;
  state.selectedYear = year;

  loadInitialData().then(renderCurrentPage);

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

  const data = state.dashboard || {};

  const summary = data.summary || {};

  const income = number(
    summary.income ||
    summary.Income ||
    getSettingNumber("MonthlyIncome", 80000)
  );

  const allocated = number(
    summary.totalAllocated ||
    summary.TotalAllocated
  );

  const spent = number(
    summary.totalSpent ||
    summary.TotalSpent
  );

  const balance = allocated - spent;

  const unallocated = income - allocated;

  const usedPercent =
    allocated > 0
      ? Math.min(100, (spent / allocated) * 100)
      : 0;


  const daysRemaining =
    data.daysRemaining ||
    calculateDaysRemaining();


  const safeDaily =
    data.safeDailySpending ||
    (
      daysRemaining > 0
        ? Math.max(0, balance / daysRemaining)
        : 0
    );


  mainContent().innerHTML = `

    <section class="page">

      <div class="page-header">

        <div>
          <div class="eyebrow">
            MONTHLY OVERVIEW
          </div>

          <h1>
            Your Money
          </h1>

          <p class="muted">
            Plan it. Track it. Improve it.
          </p>
        </div>

        <div class="month-actions">

          <button
            class="icon-button"
            onclick="changeMonth(-1)">
            ‹
          </button>

          <button
            class="icon-button"
            onclick="changeMonth(1)">
            ›
          </button>

        </div>

      </div>


      <!-- HERO -->

      <div class="hero-card">

        <div class="hero-top">

          <div>

            <span class="hero-label">
              AVAILABLE BALANCE
            </span>

            <div class="hero-amount">
              ${money(balance)}
            </div>

          </div>

          <div class="hero-icon">
            ₹
          </div>

        </div>


        <div class="progress-track">

          <div
            class="progress-fill"
            style="width:${usedPercent}%">
          </div>

        </div>


        <div class="hero-footer">

          <span>
            ${percent(usedPercent)} used
          </span>

          <span>
            ${daysRemaining} days left
          </span>

        </div>

      </div>


      <!-- KPI -->

      <div class="kpi-grid">

        ${kpiCard(
          "MONTHLY INCOME",
          money(income),
          "income"
        )}

        ${kpiCard(
          "ALLOCATED",
          money(allocated),
          "allocated"
        )}

        ${kpiCard(
          "SPENT",
          money(spent),
          "spent"
        )}

        ${kpiCard(
          "UNALLOCATED",
          money(unallocated),
          "unallocated"
        )}

      </div>


      <!-- SAFE DAILY -->

      <div class="card safe-spending-card">

        <div class="card-header">

          <div>
            <span class="eyebrow">
              SPENDING PACE
            </span>

            <h3>
              Safe Daily Spending
            </h3>
          </div>

          <span class="pill">
            ${daysRemaining} days
          </span>

        </div>

        <div class="safe-number">
          ${money(safeDaily)}
        </div>

        <p class="muted">
          Approximate amount available per remaining day,
          based on your current budget balance.
        </p>

      </div>


      <!-- QUICK ACTIONS -->

      <div class="section-header">

        <h2>
          Quick Add
        </h2>

        <button
          class="text-button"
          onclick="showExpenseModal()">
          Custom
        </button>

      </div>


      <div class="quick-actions">

        ${quickButton(50)}
        ${quickButton(100)}
        ${quickButton(200)}
        ${quickButton(500)}

      </div>


      <!-- CATEGORIES -->

      <div class="section-header">

        <h2>
          Categories
        </h2>

        <button
          class="text-button"
          onclick="navigateTo('budget')">
          Manage
        </button>

      </div>


      <div class="category-grid">

        ${renderCategoryCards()}

      </div>


      <!-- RECENT -->

      <div class="section-header">

        <h2>
          Recent Expenses
        </h2>

        <button
          class="text-button"
          onclick="navigateTo('expenses')">
          View All
        </button>

      </div>


      <div class="expense-list">

        ${renderRecentExpenses()}

      </div>


    </section>

  `;

}


/* =========================================================
   KPI CARD
   ========================================================= */

function kpiCard(title, value, type) {

  return `

    <div class="kpi-card">

      <span class="kpi-label">
        ${escapeHtml(title)}
      </span>

      <strong class="kpi-value">
        ${value}
      </strong>

    </div>

  `;

}


/* =========================================================
   QUICK BUTTON
   ========================================================= */

function quickButton(amount) {

  return `

    <button
      class="quick-button"
      onclick="quickExpense(${amount})">

      <span>+</span>

      ${money(amount)}

    </button>

  `;

}


/* =========================================================
   CATEGORY CARDS
   ========================================================= */

function renderCategoryCards() {

  const budgets = normalizeBudget(state.budget);

  if (!budgets.length) {

    return emptyState(
      "No budget yet",
      "Create your monthly allocation to see categories."
    );

  }


  return budgets.map(item => {

    const allocated = number(item.AllocatedAmount);
    const spent = getCategorySpent(item.Category);
    const balance = allocated - spent;

    const used =
      allocated > 0
        ? Math.min(100, (spent / allocated) * 100)
        : 0;

    const over = spent > allocated;


    return `

      <div class="category-card ${over ? "over-budget" : ""}">

        <div class="category-card-top">

          <div>

            <span class="category-name">
              ${escapeHtml(item.Category)}
            </span>

            <div class="category-amount">
              ${money(balance)}
            </div>

          </div>

          <span class="category-percent">
            ${percent(used)}
          </span>

        </div>


        <div class="progress-track">

          <div
            class="progress-fill"
            style="width:${used}%">
          </div>

        </div>


        <div class="category-meta">

          <span>
            Used ${money(spent)}
          </span>

          <span>
            Budget ${money(allocated)}
          </span>

        </div>


        ${
          over
            ? `
              <div class="warning-text">
                Over budget by ${money(Math.abs(balance))}
              </div>
            `
            : ""
        }

      </div>

    `;

  }).join("");

}


/* =========================================================
   EXPENSES PAGE
   ========================================================= */

function renderExpensesPage() {

  const expenses = getMonthExpenses();

  mainContent().innerHTML = `

    <section class="page">

      <div class="page-header">

        <div>

          <div class="eyebrow">
            TRANSACTIONS
          </div>

          <h1>
            Expenses
          </h1>

          <p class="muted">
            ${expenses.length} transactions this month
          </p>

        </div>

        <button
          class="primary-button"
          onclick="showExpenseModal()">

          + Add

        </button>

      </div>


      <div class="search-box">

        <input
          id="expenseSearch"
          type="search"
          placeholder="Search expenses..."
          oninput="filterExpenses(this.value)">

      </div>


      <div
        id="expensesContainer"
        class="expense-list">

        ${renderExpenseItems(expenses)}

      </div>

    </section>

  `;

}


function renderExpenseItems(expenses) {

  if (!expenses.length) {

    return emptyState(
      "No expenses yet",
      "Add your first expense for this month."
    );

  }


  return expenses.map(expense => {

    const amount = number(expense.Amount);

    return `

      <div class="expense-item">

        <div class="expense-icon">
          ${categoryIcon(expense.Category)}
        </div>


        <div class="expense-info">

          <strong>
            ${escapeHtml(
              expense.Purpose || expense.Category || "Expense"
            )}
          </strong>

          <span>

            ${escapeHtml(expense.Category || "Other")}

            •
            ${formatDate(expense.Date)}

            ${
              expense.PaymentMethod
                ? ` • ${escapeHtml(expense.PaymentMethod)}`
                : ""
            }

          </span>

          ${
            expense.Notes
              ? `
                <small>
                  ${escapeHtml(expense.Notes)}
                </small>
              `
              : ""
          }

        </div>


        <div class="expense-right">

          <strong>
            -${money(amount)}
          </strong>

          <div class="expense-actions">

            <button
              onclick='showExpenseModal(${JSON.stringify(expense).replace(/'/g, "&#39;")})'>
              Edit
            </button>

            <button
              onclick="deleteExpenseConfirm('${escapeHtml(expense.ExpenseID)}')">
              Delete
            </button>

          </div>

        </div>

      </div>

    `;

  }).join("");

}


function renderRecentExpenses() {

  const expenses = getMonthExpenses()
    .sort(
      (a, b) =>
        new Date(b.Date) - new Date(a.Date)
    )
    .slice(0, 5);

  return renderExpenseItems(expenses);

}


/* =========================================================
   EXPENSE SEARCH
   ========================================================= */

function filterExpenses(query) {

  const q = query
    .toLowerCase()
    .trim();

  const expenses = getMonthExpenses();

  const filtered = !q
    ? expenses
    : expenses.filter(expense => {

        return [

          expense.Purpose,
          expense.Category,
          expense.PaymentMethod,
          expense.Notes

        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      });


  const container = $("#expensesContainer");

  if (container) {

    container.innerHTML =
      renderExpenseItems(filtered);

  }

}


/* =========================================================
   EXPENSE MODAL
   ========================================================= */

function showExpenseModal(existing = null) {

  const categories = getCategoryNames();

  const isEdit = !!existing;

  const today =
    new Date().toISOString().split("T")[0];


  modalContainer().innerHTML = `

    <div class="modal-backdrop"
         onclick="closeModal(event)">

      <div class="modal"
           onclick="event.stopPropagation()">

        <div class="modal-header">

          <div>

            <span class="eyebrow">
              ${isEdit ? "EDIT" : "FAST ADD"}
            </span>

            <h2>
              ${isEdit ? "Edit Expense" : "Add Expense"}
            </h2>

          </div>

          <button
            class="icon-button"
            onclick="closeModal()">
            ×
          </button>

        </div>


        <form
          id="expenseForm"
          onsubmit="submitExpense(event, ${isEdit ? `'${existing.ExpenseID}'` : "null"})">


          <label>
            Date

            <input
              name="date"
              type="date"
              value="${existing?.Date || today}"
              required>

          </label>


          <label>
            Amount

            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="₹ 0"
              value="${existing?.Amount || ""}"
              required>

          </label>


          <label>
            Purpose

            <input
              name="purpose"
              type="text"
              maxlength="100"
              placeholder="What did you spend on?"
              value="${escapeHtml(existing?.Purpose || "")}"
              required>

          </label>


          <label>
            Category

            <select
              name="category"
              required>

              <option value="">
                Select category
              </option>

              ${categories.map(category => `

                <option
                  value="${escapeHtml(category)}"
                  ${
                    existing?.Category === category
                      ? "selected"
                      : ""
                  }>

                  ${escapeHtml(category)}

                </option>

              `).join("")}

            </select>

          </label>


          <label>
            Payment Method

            <select name="paymentMethod">

              ${[
                "UPI",
                "Cash",
                "Debit Card",
                "Credit Card",
                "Bank Transfer",
                "Other"
              ].map(method => `

                <option
                  value="${method}"
                  ${
                    existing?.PaymentMethod === method
                      ? "selected"
                      : ""
                  }>

                  ${method}

                </option>

              `).join("")}

            </select>

          </label>


          <label>
            Notes

            <textarea
              name="notes"
              maxlength="250"
              placeholder="Optional notes...">${escapeHtml(existing?.Notes || "")}</textarea>

          </label>


          <div class="quick-actions modal-quick">

            ${[50,100,200,500].map(amount => `

              <button
                type="button"
                class="quick-button"
                onclick="setExpenseAmount(${amount})">

                +${amount}

              </button>

            `).join("")}

          </div>


          <button
            class="primary-button full-width"
            type="submit">

            ${isEdit ? "Save Changes" : "Add Expense"}

          </button>


        </form>

      </div>

    </div>

  `;

}


function setExpenseAmount(amount) {

  const input =
    document.querySelector(
      '#expenseForm input[name="amount"]'
    );

  if (input) {

    input.value = amount;

    input.focus();

  }

}


function closeModal(event) {

  if (
    event &&
    event.target &&
    !event.target.classList.contains("modal-backdrop")
  ) {

    return;

  }

  modalContainer().innerHTML = "";

}


/* =========================================================
   ADD / EDIT EXPENSE
   ========================================================= */

async function submitExpense(event, expenseId) {

  event.preventDefault();

  const form = event.target;

  const formData = new FormData(form);


  const expense = {

    ExpenseID:
      expenseId ||
      generateId("EXP"),

    Date:
      formData.get("date"),

    Amount:
      number(formData.get("amount")),

    Purpose:
      cleanText(formData.get("purpose")),

    Category:
      cleanText(formData.get("category")),

    PaymentMethod:
      cleanText(formData.get("paymentMethod")),

    Notes:
      cleanText(formData.get("notes"))

  };


  if (!expense.Date) {

    showToast("Please select a date.", "error");
    return;

  }


  if (expense.Amount <= 0) {

    showToast("Enter a valid amount.", "error");
    return;

  }


  if (!expense.Purpose) {

    showToast("Enter the expense purpose.", "error");
    return;

  }


  if (!expense.Category) {

    showToast("Select a category.", "error");
    return;

  }


  try {

    if (expenseId) {

      updateLocalExpense(expense);

      saveLocalState();

      closeModal();

      renderCurrentPage();

      await api("editExpense", {
        expenseId,
        ...expense
      });

      showToast(
        "Expense updated successfully",
        "success"
      );

    } else {

      addLocalExpense(expense);

      saveLocalState();

      closeModal();

      renderCurrentPage();

      try {

        const result = await api("addExpense", expense);

        if (
          result &&
          result.ExpenseID
        ) {

          replaceLocalExpenseId(
            expense.ExpenseID,
            result.ExpenseID
          );

        }

        showToast(
          "Expense added",
          "success"
        );

      } catch (error) {

        showToast(
          "Saved locally. Sync when online.",
          "warning"
        );

      }

    }


    await refreshDashboard();

  } catch (error) {

    console.error(error);

    showToast(
      error.message || "Unable to save expense",
      "error"
    );

  }

}


/* =========================================================
   QUICK EXPENSE
   ========================================================= */

function quickExpense(amount) {

  showExpenseModal();

  setTimeout(() => {

    setExpenseAmount(amount);

  }, 100);

}


/* =========================================================
   LOCAL EXPENSE FUNCTIONS
   ========================================================= */

function addLocalExpense(expense) {

  state.expenses.push({

    ...expense,

    CreatedAt:
      new Date().toISOString(),

    UpdatedAt:
      new Date().toISOString()

  });

}


function updateLocalExpense(expense) {

  const index =
    state.expenses.findIndex(
      e => e.ExpenseID === expense.ExpenseID
    );

  if (index === -1) {

    state.expenses.push(expense);

  } else {

    state.expenses[index] = {
      ...state.expenses[index],
      ...expense,
      UpdatedAt:
        new Date().toISOString()
    };

  }

}


function replaceLocalExpenseId(
  oldId,
  newId
) {

  const expense =
    state.expenses.find(
      e => e.ExpenseID === oldId
    );

  if (expense) {

    expense.ExpenseID = newId;

    saveLocalState();

  }

}


/* =========================================================
   DELETE EXPENSE
   ========================================================= */

async function deleteExpenseConfirm(expenseId) {

  const expense =
    state.expenses.find(
      e => e.ExpenseID === expenseId
    );

  if (!expense) return;


  const confirmed =
    confirm(
      `Delete "${expense.Purpose}" expense of ${money(expense.Amount)}?`
    );


  if (!confirmed) return;


  state.expenses =
    state.expenses.filter(
      e => e.ExpenseID !== expenseId
    );


  saveLocalState();

  renderCurrentPage();


  try {

    await api("deleteExpense", {
      expenseId
    });

    showToast(
      "Expense deleted",
      "success"
    );

    await refreshDashboard();

  } catch (error) {

    showToast(
      "Deleted locally. Server sync pending.",
      "warning"
    );

  }

}


/* =========================================================
   BUDGET PAGE
   ========================================================= */

function renderBudgetPage() {

  const income =
    getSettingNumber(
      "MonthlyIncome",
      80000
    );


  const budgets =
    normalizeBudget(state.budget);


  const allocated =
    budgets.reduce(
      (sum, item) =>
        sum + number(item.AllocatedAmount),
      0
    );


  const remaining =
    income - allocated;


  mainContent().innerHTML = `

    <section class="page">

      <div class="page-header">

        <div>

          <div class="eyebrow">
            MONTHLY PLAN
          </div>

          <h1>
            Budget
          </h1>

          <p class="muted">
            Decide where your income should go.
          </p>

        </div>

      </div>


      <div class="card budget-summary">

        <div>

          <span>
            Monthly Income
          </span>

          <strong>
            ${money(income)}
          </strong>

        </div>


        <div>

          <span>
            Allocated
          </span>

          <strong>
            ${money(allocated)}
          </strong>

        </div>


        <div>

          <span>
            ${remaining >= 0
              ? "Unallocated"
              : "Over Allocation"}
          </span>

          <strong class="${
            remaining < 0
              ? "danger-text"
              : ""
          }">

            ${money(Math.abs(remaining))}

          </strong>

        </div>

      </div>


      ${
        remaining < 0
          ? `
            <div class="alert alert-danger">

              Your allocation exceeds this month's
              available income by
              <strong>${money(Math.abs(remaining))}</strong>.

            </div>
          `
          : ""
      }


      <div class="budget-list">

        ${renderBudgetEditor(budgets)}

      </div>


      <div class="budget-actions">

        <button
          class="secondary-button"
          onclick="copyPreviousBudgetAction()">

          Copy Last Month's Budget

        </button>


        <button
          class="primary-button"
          onclick="saveBudgetAction()">

          Save Budget

        </button>

      </div>


    </section>

  `;

}


/* =========================================================
   BUDGET EDITOR
   ========================================================= */

function renderBudgetEditor(budgets) {

  const names =
    getCategoryNames();


  return names.map(category => {

    const existing =
      budgets.find(
        item =>
          item.Category === category
      );


    const amount =
      existing
        ? number(existing.AllocatedAmount)
        : 0;


    return `

      <div class="budget-row">

        <div class="budget-category">

          <span class="category-icon">
            ${categoryIcon(category)}
          </span>

          <div>

            <strong>
              ${escapeHtml(category)}
            </strong>

            <small>
              Monthly allocation
            </small>

          </div>

        </div>


        <div class="budget-input-wrap">

          <span>
            ₹
          </span>

          <input
            class="budget-input"
            data-category="${escapeHtml(category)}"
            type="number"
            min="0"
            step="1"
            value="${amount}">

        </div>

      </div>

    `;

  }).join("");

}


/* =========================================================
   SAVE BUDGET
   ========================================================= */

async function saveBudgetAction() {

  const income =
    getSettingNumber(
      "MonthlyIncome",
      80000
    );


  const inputs =
    $$(".budget-input");


  const budget = [];

  let total = 0;


  inputs.forEach(input => {

    const amount =
      number(input.value);

    const category =
      input.dataset.category;


    total += amount;


    budget.push({

      BudgetID:
        generateBudgetId(
          category
        ),

      Month:
        state.selectedMonth,

      Year:
        state.selectedYear,

      Income:
        income,

      Category:
        category,

      AllocatedAmount:
        amount

    });

  });


  if (total > income) {

    showToast(
      `Allocation exceeds income by ${money(total - income)}`,
      "error"
    );

    return;

  }


  try {

    await api("saveBudget", {

      month:
        state.selectedMonth,

      year:
        state.selectedYear,

      income,

      budget

    });


    state.budget = budget;

    saveLocalState();

    await refreshDashboard();

    showToast(
      "Monthly budget saved",
      "success"
    );

    renderCurrentPage();

  } catch (error) {

    state.budget = budget;

   
