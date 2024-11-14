const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const api = require('@actual-app/api');
const cron = require('node-cron');

const dataDir = path.join(os.tmpdir(), 'actual-data');
const bankSyncSchedule = process.env.BANK_SYNC_CRON || '0 * * * *'; // Default to hourly if not set

// Initialize and setup the API
async function initializeAPI() {
  console.log('Initializing data directory...');
  const dataDir = path.join(os.tmpdir(), 'actual-data');
  await fs.mkdir(dataDir, { recursive: true });
  console.log('Initialized data directory');

  
  console.log('Initializing Actual API...');
  await api.init({
    dataDir: dataDir,
    serverURL: process.env.SERVER_URL,
    password: process.env.SERVER_PASSWORD,
  });
  console.log('API initialized successfully');
}

async function downloadBudget() {
  const downloadOptions = {};
  if (process.env.BUDGET_PASSWORD) {
    downloadOptions.password = process.env.BUDGET_PASSWORD;
  }

  console.log('Downloading budget...');
  await api.downloadBudget(process.env.BUDGET_UUID, downloadOptions);
  console.log('Downloaded budget');

  // const accounts = await api.getAccounts();
  // console.log(`Successfully accessed budget - found ${accounts.length} accounts`);
}


// Get all accounts
async function getAllAccountIds() {
  const accounts = await api.getAccounts();
  
  let acctIds = [];
  acctIds = accounts.map(account => account.id);
  console.log(`Got account IDs: ${acctIds}`);
  return acctIds;
  // accounts.forEach(acct => {
  //   console.log(acct.id);
    
  // });
  // console.log(accounts);
}


// Get categories - in two groups, expenses and income-only expenses
async function getCategories() {
  const expense_categories = {}
  const income_only_categories = {}
  console.log('Getting categories...');
  const categories = await api.getCategoryGroups();
  console.log('Got categories');
  console.log(categories);

  if (Array.isArray(categories) && categories.length > 0) {
    categories.forEach(group => {
      let groupCategories = group.categories;
      // console.log(group.categories);
      groupCategories.forEach(category => {
        if (category.is_income) {
          income_only_categories[category.id] = category
        } else {
          expense_categories[category.id] = category
        }
      });
    });
    // console.log("Expenses:");
    // console.log(expense_categories);
    // console.log("Income only:");
    // console.log(income_only_categories);
  } else {
    console.warn(categories ? 'Categories is empty' : 'Categories is null');
  }
  return expense_categories, income_only_categories;
}

// Get all transactions
async function getTransactionsAllAccounts(startDate, endDate) {
  let allTransactions = {};
  
  let accountIds = await getAllAccountIds();

  for (const acct of accountIds) {
    let transactions = await api.getTransactions(acct, startDate, endDate);
    if (transactions.length > 0) {
      transactions.forEach(transaction => {
        allTransactions[transaction.id] = transaction;
      });
    }
  }

  // console.log(allTransactions);
  return allTransactions;
}

function filterNoCategory(transactions) {
  // const nullCategoryTransactions = Object.values(transactions).filter(
  //   transaction => transaction.category === null
  // );
  const nullCategoryTransactions = Object.fromEntries(
    Object.entries(transactions).filter(
      ([, transaction]) => transaction.category === null
    )
  );
  return nullCategoryTransactions;
}


// Run bank sync
async function runBankSync() {
  console.log("Running bank sync...");
  await api.runBankSync();
  console.log("Bank sync completed.");
}

// Schedule tasks
function scheduleBankSync() {
  // Schedule bank sync based on cron-style schedule
  console.log(`runBankSync scheduled for: ${bankSyncSchedule}`);
  cron.schedule(bankSyncSchedule, runBankSync);
}

// Gracefully shutdown API on exit signals
async function shutdownAPI() {
  try {
    console.log('Shutting down API...');
    await api.shutdown();
    console.log('API shut down successfully');
  } catch (error) {
    console.log(`Error during shutdown: ${error.message}`);
  }
}

// Main function to initialize, download, and schedule tasks
async function main() {
  try {
    await initializeAPI();
    await downloadBudget();
    scheduleBankSync();

    // Schedule downloadAndPrintBudget to run every 5 minutes
    // await downloadAndPrintBudget();
    // setInterval(downloadAndPrintBudget, 5 * 60 * 1000);

    await getCategories();
    // await getAllAccountIds();
    allTransactions = await getTransactionsAllAccounts('2024-10-01', '2024-10-30');
    
    console.log(filterNoCategory(allTransactions));
    
    console.log("Program is running...");

    // Listen for termination signals to shut down gracefully
    process.on('SIGINT', shutdownAPI);
    process.on('SIGTERM', shutdownAPI);
  } catch (error) {
    console.log(`Error: ${error.message}`);
    if (error.stack) console.log(`Stack trace: ${error.stack}`);
    await shutdownAPI();
  }
}

main();