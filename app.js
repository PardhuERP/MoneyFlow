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
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
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

    saveLocalState();

    showToast(
      "Budget saved locally. Server sync pending.",
      "warning"
    );

    renderCurrentPage();

  }

}

/* =========================================================
   COPY PREVIOUS BUDGET
   ========================================================= */

async function copyPreviousBudgetAction() {

  const confirmed =
    confirm(
      "Copy last month's budget into this month?"
    );


  if (!confirmed) return;


  try {

    await api("copyPreviousBudget", {

      month:
        state.selectedMonth,

      year:
        state.selectedYear

    });


    await loadInitialData();

    renderCurrentPage();

    showToast(
      "Previous budget copied",
      "success"
    );

  } catch (error) {

    showToast(
      "Unable to copy previous budget",
      "error"
    );

  }

}


/* =========================================================
   INSIGHTS PAGE
   ========================================================= */

function renderInsightsPage() {

  const data =
    state.dashboard || {};


  const summary =
    data.summary || {};


  const expenses =
    getMonthExpenses();


  const totalSpent =
    expenses.reduce(
      (sum, expense) =>
        sum + number(expense.Amount),
      0
    );


  const dailyAverage =
    expenses.length
      ? totalSpent /
        Math.max(
          1,
          new Date().getDate()
        )
      : 0;


  const daysRemaining =
    calculateDaysRemaining();


  const balance =
    getTotalAllocated() -
    totalSpent;


  const estimatedEnd =
    Math.max(
      0,
      balance -
      dailyAverage * daysRemaining
    );


  const categoryStats =
    getCategoryStats();


  const highest =
    categoryStats
      .sort(
        (a, b) =>
          b.spent - a.spent
      )[0];


  mainContent().innerHTML = `

    <section class="page">

      <div class="page-header">

        <div>

          <div class="eyebrow">
            MONEY ANALYSIS
          </div>

          <h1>
            Insights
          </h1>

          <p class="muted">
            Understand your spending pattern.
          </p>

        </div>

      </div>


      <div class="insight-grid">


        <div class="insight-card">

          <span>
            Daily Average
          </span>

          <strong>
            ${money(dailyAverage)}
          </strong>

        </div>


        <div class="insight-card">

          <span>
            Estimated Month-End Balance
          </span>

          <strong>
            ${money(estimatedEnd)}
          </strong>

        </div>


        ${
          highest
            ? `
              <div class="insight-card">

                <span>
                  Highest Spending Category
                </span>

                <strong>
                  ${escapeHtml(highest.category)}
                </strong>

                <small>
                  ${money(highest.spent)} spent
                </small>

              </div>
            `
            : ""
        }


      </div>


      <div class="card">

        <div class="card-header">

          <div>

            <span class="eyebrow">
              CATEGORY BREAKDOWN
            </span>

            <h3>
              Where Your Money Goes
            </h3>

          </div>

        </div>


        ${renderInsightCategoryBars(categoryStats)}

      </div>


      <div class="card">

        <div class="card-header">

          <div>

            <span class="eyebrow">
              AI-STYLE OBSERVATIONS
            </span>

            <h3>
              Suggestions
            </h3>

          </div>

        </div>


        ${generateInsights()}

      </div>


    </section>

  `;

}

/* =========================================================
   INSIGHT CATEGORY BARS
   ========================================================= */

function renderInsightCategoryBars(stats) {

  if (!stats.length) {

    return emptyState(
      "No spending data",
      "Add expenses to generate insights."
    );

  }


  const max =
    Math.max(
      ...stats.map(item => item.spent),
      1
    );


  return stats
    .filter(item => item.spent > 0)
    .sort(
      (a, b) =>
        b.spent - a.spent
    )
    .map(item => `

      <div class="summary-row">

        <div class="summary-row-top">

          <span>
            ${escapeHtml(item.category)}
          </span>

          <strong>
            ${money(item.spent)}
          </strong>

        </div>


        <div class="progress-track">

          <div
            class="progress-fill"
            style="width:${(item.spent / max) * 100}%">
          </div>

        </div>

      </div>

    `)
    .join("");

}


/* =========================================================
   INSIGHT GENERATOR
   ========================================================= */

function generateInsights() {

  const insights = [];


  const income =
    getSettingNumber(
      "MonthlyIncome",
      80000
    );


  const spent =
    getMonthExpenses()
      .reduce(
        (sum, e) =>
          sum + number(e.Amount),
        0
      );


  const allocated =
    getTotalAllocated();


  const usedPercent =
    allocated > 0
      ? (spent / allocated) * 100
      : 0;


  if (allocated > income) {

    insights.push(
      "Your current allocations are above monthly income. Review the budget before adding more spending."
    );

  }


  if (usedPercent >= 90) {

    insights.push(
      "You have used more than 90% of your allocated budget. Review remaining category balances before discretionary spending."
    );

  } else if (usedPercent >= 75) {

    insights.push(
      "You have used more than 75% of your allocated budget. Keep an eye on the remaining days of the month."
    );

  } else {

    insights.push(
      "Your spending is currently below 75% of allocated budget. Continue tracking actual expenses to understand your normal pattern."
    );

  }


  const unallocated =
    income - allocated;


  if (unallocated > 0) {

    insights.push(
      `${money(unallocated)} is currently unallocated. You can assign it to a category, Savings, or Emergency Fund.`
    );

  }


  if (!insights.length) {

    insights.push(
      "Keep recording expenses consistently. More actual data will make the analysis more useful."
    );

  }


  return insights.map(message => `

    <div class="insight-message">

      <span class="insight-dot"></span>

      <p>
        ${escapeHtml(message)}
      </p>

    </div>

  `).join("");

}


/* =========================================================
   SETTINGS PAGE
   ========================================================= */

function renderSettingsPage() {

  const income =
    getSettingNumber(
      "MonthlyIncome",
      80000
    );


  const rent =
    getSettingNumber(
      "Rent",
      12500
    );


  const electricity =
    getSettingNumber(
      "Electricity",
      500
    );


  mainContent().innerHTML = `

    <section class="page">

      <div class="page-header">

        <div>

          <div class="eyebrow">
            PREFERENCES
          </div>

          <h1>
            Settings
          </h1>

          <p class="muted">
            Configure your MoneyFlow system.
          </p>

        </div>

      </div>


      <div class="card settings-card">

        <h3>
          Monthly Income
        </h3>

        <label>

          Monthly Income

          <input
            id="settingIncome"
            type="number"
            value="${income}"
            min="0">

        </label>

      </div>


      <div class="card settings-card">

        <h3>
          Fixed Expenses
        </h3>


        <label>

          Rent

          <input
            id="settingRent"
            type="number"
            value="${rent}"
            min="0">

        </label>


        <label>

          Electricity

          <input
            id="settingElectricity"
            type="number"
            value="${electricity}"
            min="0">

        </label>


        <p class="muted">
          Current fixed total:
          ${money(rent + electricity)}
        </p>

      </div>


      <div class="card settings-card">

        <h3>
          Alerts
        </h3>

        <label class="switch-row">

          <span>
            Budget Alerts
          </span>

          <input
            id="alertsEnabled"
            type="checkbox"
            ${
              String(
                state.settings?.AlertsEnabled
              ) === "true"
                ? "checked"
                : ""
            }>

        </label>

      </div>


      <div class="card settings-card">

        <h3>
          Appearance
        </h3>


        <button
          class="secondary-button"
          onclick="toggleTheme()">

          Toggle Light / Dark Mode

        </button>

      </div>


      <div class="card settings-card">

        <h3>
          Data
        </h3>


        <button
          class="secondary-button full-width"
          onclick="exportCSV()">

          Export Expenses CSV

        </button>


        <br>


        <button
          class="secondary-button full-width"
          onclick="resetLocalData()">

          Reset Local App Data

        </button>

      </div>


      <button
        class="primary-button full-width"
        onclick="saveSettingsAction()">

        Save Settings

      </button>


    </section>

  `;

}

/* =========================================================
   SAVE SETTINGS
   ========================================================= */

async function saveSettingsAction() {

  const income =
    number(
      $("#settingIncome")?.value
    );


  const rent =
    number(
      $("#settingRent")?.value
    );


  const electricity =
    number(
      $("#settingElectricity")?.value
    );


  const alerts =
    $("#alertsEnabled")?.checked;


  if (income <= 0) {

    showToast(
      "Monthly income must be greater than zero.",
      "error"
    );

    return;

  }


  const settings = {

    MonthlyIncome:
      String(income),

    Rent:
      String(rent),

    Electricity:
      String(electricity),

    AlertsEnabled:
      String(alerts)

  };


  state.settings = {
    ...state.settings,
    ...settings
  };


  saveLocalState();


  try {

    await api("saveSettings", {
      settings
    });

    showToast(
      "Settings saved",
      "success"
    );

  } catch (error) {

    showToast(
      "Saved locally. Server sync pending.",
      "warning"
    );

  }


  await refreshDashboard();

  renderCurrentPage();

}


/* =========================================================
   CATEGORY MANAGEMENT
   ========================================================= */

function getCategoryNames() {

  const names =
    state.categories
      .map(category => {

        if (typeof category === "string") {

          return category;

        }

        return (
          category.CategoryName ||
          category.categoryName ||
          ""
        );

      })
      .filter(Boolean);


  if (!names.length) {

    return [

      "Daily Needs",
      "Food",
      "Entertainment",
      "Rent",
      "Electricity",
      "Travel / Trip",
      "Health",
      "Shopping",
      "Bills",
      "Family",
      "Education",
      "Savings",
      "Emergency",
      "Other"

    ];

  }


  return names;

}


function addNewCategory() {

  const name =
    prompt("Enter new category name:");

  if (!name) return;


  const clean =
    cleanText(name);


  if (!clean) return;


  if (
    getCategoryNames()
      .some(
        item =>
          item.toLowerCase() ===
          clean.toLowerCase()
      )
  ) {

    showToast(
      "Category already exists.",
      "warning"
    );

    return;

  }


  api("addCategory", {
    categoryName: clean
  })
    .then(() => {

      state.categories.push({
        CategoryName: clean
      });

      saveLocalState();

      renderCurrentPage();

      showToast(
        "Category added",
        "success"
      );

    })
    .catch(error => {

      state.categories.push({
        CategoryName: clean
      });

      saveLocalState();

      renderCurrentPage();

      showToast(
        "Category added locally",
        "warning"
      );

    });

}

/* =========================================================
   SETUP WIZARD
   ========================================================= */

function showSetupWizard() {

  const income =
    getSettingNumber(
      "MonthlyIncome",
      80000
    );


  const rent =
    getSettingNumber(
      "Rent",
      12500
    );


  const electricity =
    getSettingNumber(
      "Electricity",
      500
    );


  const available =
    income -
    rent -
    electricity;


  modalContainer().innerHTML = `

    <div class="modal-backdrop setup-backdrop">

      <div class="modal setup-wizard">

        <div class="setup-step">

          <div class="setup-logo">
            ₹
          </div>

          <span class="eyebrow">
            WELCOME TO MONEYFLOW
          </span>

          <h1>
            Take control of your monthly money.
          </h1>

          <p class="muted">
            First, let's set up your monthly income
            and fixed expenses.
          </p>


          <label>

            Monthly Income

            <input
              id="setupIncome"
              type="number"
              value="${income}"
              min="0">

          </label>


          <label>

            Rent

            <input
              id="setupRent"
              type="number"
              value="${rent}"
              min="0">

          </label>


          <label>

            Electricity

            <input
              id="setupElectricity"
              type="number"
              value="${electricity}"
              min="0">

          </label>


          <div class="setup-summary">

            <span>
              Available for allocation
            </span>

            <strong id="setupAvailable">
              ${money(available)}
            </strong>

          </div>


          <button
            class="primary-button full-width"
            onclick="completeSetup()">

            Continue

          </button>

        </div>

      </div>

    </div>

  `;


  ["setupIncome", "setupRent", "setupElectricity"]
    .forEach(id => {

      const input = $("#" + id);

      if (input) {

        input.addEventListener(
          "input",
          updateSetupAvailable
        );

      }

    });

}


function updateSetupAvailable() {

  const income =
    number(
      $("#setupIncome")?.value
    );


  const rent =
    number(
      $("#setupRent")?.value
    );


  const electricity =
    number(
      $("#setupElectricity")?.value
    );


  const available =
    income -
    rent -
    electricity;


  const element =
    $("#setupAvailable");


  if (element) {

    element.textContent =
      money(Math.max(0, available));

  }

}


async function completeSetup() {

  const income =
    number(
      $("#setupIncome")?.value
    );


  const rent =
    number(
      $("#setupRent")?.value
    );


  const electricity =
    number(
      $("#setupElectricity")?.value
    );


  if (income <= 0) {

    showToast(
      "Enter a valid monthly income.",
      "error"
    );

    return;

  }


  if (
    rent + electricity >
    income
  ) {

    showToast(
      "Fixed expenses cannot exceed income.",
      "error"
    );

    return;

  }


  state.settings = {

    ...state.settings,

    MonthlyIncome:
      String(income),

    Rent:
      String(rent),

    Electricity:
      String(electricity)

  };


  state.setupComplete = true;


  saveLocalState();


  try {

    await api("saveSettings", {
      settings: state.settings
    });

  } catch (error) {

    console.warn(
      "Setup saved locally."
    );

  }


  modalContainer().innerHTML = "";


  showToast(
    "MoneyFlow setup complete!",
    "success"
  );


  await refreshDashboard();

  renderCurrentPage();

}

/* =========================================================
   THEME
   ========================================================= */

function applySavedTheme() {

  const theme =
    localStorage.getItem(
      CONFIG.THEME_KEY
    );


  if (theme === "dark") {

    document.documentElement
      .setAttribute(
        "data-theme",
        "dark"
      );

  }

}


function toggleTheme() {

  const current =
    document.documentElement
      .getAttribute("data-theme");


  const next =
    current === "dark"
      ? "light"
      : "dark";


  document.documentElement
    .setAttribute(
      "data-theme",
      next
    );


  localStorage.setItem(
    CONFIG.THEME_KEY,
    next
  );

}


/* =========================================================
   DASHBOARD REFRESH
   ========================================================= */

async function refreshDashboard() {

  try {

    const data =
      await api("getDashboard", {

        month:
          state.selectedMonth,

        year:
          state.selectedYear

      });


    state.dashboard =
      data;


    if (data?.expenses) {

      state.expenses =
        data.expenses;

    }


    saveLocalState();

  } catch (error) {

    console.warn(
      "Dashboard refresh failed",
      error
    );

  }

}


/* =========================================================
   NAVIGATION HELPER
   ========================================================= */

function navigateTo(page) {

  state.currentPage =
    page;

  saveLocalState();

  renderCurrentPage();

}


/* =========================================================
   CALCULATIONS
   ========================================================= */

function getMonthExpenses() {

  const month =
    state.selectedMonth;

  const year =
    state.selectedYear;


  return state.expenses.filter(
    expense => {

      const date =
        new Date(expense.Date);


      return (
        date.getMonth() + 1 === month &&
        date.getFullYear() === year
      );

    }
  );

}


function getTotalAllocated() {

  return normalizeBudget(
    state.budget
  ).reduce(
    (sum, item) =>
      sum + number(item.AllocatedAmount),
    0
  );

}


function getCategorySpent(category) {

  return getMonthExpenses()
    .filter(
      expense =>
        expense.Category === category
    )
    .reduce(
      (sum, expense) =>
        sum + number(expense.Amount),
      0
    );

}


function getCategoryStats() {

  return getCategoryNames()
    .map(category => {

      const budget =
        normalizeBudget(state.budget)
          .find(
            item =>
              item.Category === category
          );


      return {

        category,

        allocated:
          number(
            budget?.AllocatedAmount
          ),

        spent:
          getCategorySpent(category)

      };

    });

}


function calculateDaysRemaining() {

  const now =
    new Date();


  const lastDay =
    new Date(
      state.selectedYear,
      state.selectedMonth,
      0
    );


  if (
    now.getFullYear() !==
      state.selectedYear ||
    now.getMonth() + 1 !==
      state.selectedMonth
  ) {

    return lastDay.getDate();

  }


  return Math.max(
    1,
    lastDay.getDate() -
      now.getDate()
  );

}


/* =========================================================
   DATA NORMALIZATION
   ========================================================= */

function normalizeBudget(data) {

  if (!Array.isArray(data)) {

    return [];

  }


  return data
    .map(item => {

      if (typeof item === "object") {

        return {

          Category:
            item.Category ||
            item.category ||
            "",

          AllocatedAmount:
            number(
              item.AllocatedAmount ??
              item.allocatedAmount ??
              0
            ),

          BudgetID:
            item.BudgetID ||
            item.budgetID ||
            ""

        };

      }

      return null;

    })
    .filter(Boolean)
    .filter(
      item =>
        item.Category
    );

}

/* =========================================================
   CSV EXPORT
   ========================================================= */

function exportCSV() {

  const expenses =
    getMonthExpenses();


  if (!expenses.length) {

    showToast(
      "No expenses to export.",
      "warning"
    );

    return;

  }


  const headers = [

    "ExpenseID",
    "Date",
    "Amount",
    "Purpose",
    "Category",
    "PaymentMethod",
    "Notes"

  ];


  const rows =
    expenses.map(expense => [

      expense.ExpenseID,
      expense.Date,
      expense.Amount,
      expense.Purpose,
      expense.Category,
      expense.PaymentMethod,
      expense.Notes

    ]);


  const csv = [

    headers,

    ...rows

  ]
    .map(row =>
      row.map(csvEscape).join(",")
    )
    .join("\n");


  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );


  const url =
    URL.createObjectURL(blob);


  const link =
    document.createElement("a");


  link.href = url;

  link.download =
    `MoneyFlow_${state.selectedYear}_${String(
      state.selectedMonth
    ).padStart(2, "0")}.csv`;


  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);


  showToast(
    "CSV exported",
    "success"
  );

}


function csvEscape(value) {

  const text =
    String(value ?? "");


  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {

    return `"${text.replace(
      /"/g,
      '""'
    )}"`;

  }


  return text;

}


/* =========================================================
   RESET LOCAL DATA
   ========================================================= */

function resetLocalData() {

  const confirmed =
    confirm(
      "Reset local MoneyFlow data? Server data will not be deleted."
    );


  if (!confirmed) return;


  localStorage.removeItem(
    CONFIG.STORAGE_KEY
  );


  location.reload();

}


/* =========================================================
   UI HELPERS
   ========================================================= */

function emptyState(
  title,
  message
) {

  return `

    <div class="empty-state">

      <div class="empty-icon">
        ₹
      </div>

      <h3>
        ${escapeHtml(title)}
      </h3>

      <p>
        ${escapeHtml(message)}
      </p>

    </div>

  `;

}


function showToast(
  message,
  type = "info"
) {

  const toast =
    toastElement();


  if (!toast) {

    console.log(message);

    return;

  }


  toast.textContent =
    message;


  toast.className =
    `toast toast-${type} show`;


  clearTimeout(
    window.moneyflowToastTimer
  );


  window.moneyflowToastTimer =
    setTimeout(() => {

      toast.classList.remove(
        "show"
      );

    }, 3000);

}


function money(value) {

  const amount =
    number(value);


  return CONFIG.CURRENCY +
    amount.toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    );

}


function percent(value) {

  return `${number(value).toFixed(0)}%`;

}


function number(value) {

  const n =
    parseFloat(value);


  return Number.isFinite(n)
    ? n
    : 0;

}


function cleanText(value) {

  return String(
    value ?? ""
  )
    .trim()
    .replace(/\s+/g, " ");

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function formatDate(dateValue) {

  if (!dateValue) return "";

  const date =
    new Date(dateValue);


  if (Number.isNaN(date.getTime())) {

    return dateValue;

  }


  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short"
    }
  );

}


function generateId(prefix) {

  return (
    prefix +
    "_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 8)
  );

}


function generateBudgetId(category) {

  return (
    "BUDGET_" +
    state.selectedYear +
    "_" +
    String(
      state.selectedMonth
    ).padStart(2, "0") +
    "_" +
    cleanText(category)
      .replace(/\s+/g, "_")
      .toUpperCase()
  );

}


function getSettingNumber(
  key,
  fallback
) {

  const value =
    state.settings?.[key];


  const parsed =
    number(value);


  return parsed > 0
    ? parsed
    : fallback;

}


function categoryIcon(category) {

  const icons = {

    "Daily Needs": "🛒",
    "Food": "🍽️",
    "Entertainment": "🎬",
    "Rent": "🏠",
    "Electricity": "⚡",
    "Travel / Trip": "✈️",
    "Health": "❤️",
    "Shopping": "🛍️",
    "Bills": "🧾",
    "Family": "👨‍👩‍👧",
    "Education": "📚",
    "Savings": "💰",
    "Emergency": "🛡️",
    "Other": "📦"

  };


  return icons[category] || "₹";

}

/* =========================================================
   GLOBAL ACCESS
   ========================================================= */

window.changeMonth =
  changeMonth;

window.navigateTo =
  navigateTo;

window.showExpenseModal =
  showExpenseModal;

window.closeModal =
  closeModal;

window.submitExpense =
  submitExpense;

window.quickExpense =
  quickExpense;

window.setExpenseAmount =
  setExpenseAmount;

window.deleteExpenseConfirm =
  deleteExpenseConfirm;

window.filterExpenses =
  filterExpenses;

window.saveBudgetAction =
  saveBudgetAction;

window.copyPreviousBudgetAction =
  copyPreviousBudgetAction;

window.saveSettingsAction =
  saveSettingsAction;

window.addNewCategory =
  addNewCategory;

window.completeSetup =
  completeSetup;

window.toggleTheme =
  toggleTheme;

window.exportCSV =
  exportCSV;

window.resetLocalData =
  resetLocalData;


/* =========================================================
   END
   ========================================================= */
