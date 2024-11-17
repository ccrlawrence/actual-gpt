const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const api = require('@actual-app/api');
const cron = require('node-cron');
const openai = require('openai');

const dataDir = path.join(os.tmpdir(), 'actual-data');
const bankSyncSchedule = process.env.ACTUALGPT_BANK_SYNC_CRON || '0 0 * * *'; // Default to daily if not set
const categoriseSchedule = process.env.ACTUALGPT_CATEGORISE_CRON || '0 * * * *'; // Default to hourly if not set
let openAIClient = null;

// Function to find a yyyy-mm-dd from a number of days ago
const getFormattedDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo); // Subtract days
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Function to find id from category name
const findKeyByName = (obj, nameToFind) => {
  const entry = Object.entries(obj).find(
    ([key, value]) => value.name === nameToFind
  );
  return entry ? entry[0] : null; // Return the key, or null if not found
};

// Initialize and setup the API
async function initialiseAPI() {
  console.log('Initialising data directory...');
  const dataDir = path.join(os.tmpdir(), 'actual-data');
  await fsp.mkdir(dataDir, { recursive: true });
  console.log('Initialised data directory');
  console.log('Initialising Actual API...');
  await api.init({
    dataDir: dataDir,
    serverURL: process.env.SERVER_URL,
    password: process.env.SERVER_PASSWORD,
  });
  console.log('API initialised successfully');
}

function initialiseOpenAI() {
  // Initialize the OpenAI model
  console.log('Initialising OpenAI...');
  openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('Initialised OpenAI');
}

async function downloadBudget() {
  console.log('Downloading budget...');
  const downloadOptions = {};
  if (process.env.BUDGET_PASSWORD) {
    downloadOptions.password = process.env.BUDGET_PASSWORD;
  }

  await api.downloadBudget(process.env.BUDGET_UUID, downloadOptions);
  console.log('Downloaded budget');
}


// Get all accounts
async function getAllAccounts() {
  console.log('Getting all accounts...');
  const accounts = await api.getAccounts();
  
  let returnAccounts = {};
  for (account in accounts) {
    returnAccounts[accounts[account].id] = accounts[account];
  }
  
  console.log(`Got all accounts: ${returnAccounts}`);
  
  return returnAccounts;
}


// Get categories - in two groups, expenses and income-only expenses
async function getCategories() {
  const expense_categories = {}
  const income_only_categories = {}
  console.log('Getting categories...');
  const categories = await api.getCategoryGroups();
  console.log('Got categories');

  if (Array.isArray(categories) && categories.length > 0) {
    categories.forEach(group => {
      let groupCategories = group.categories;
      groupCategories.forEach(category => {
        if (category.is_income) {
          income_only_categories[category.id] = category
        } else {
          expense_categories[category.id] = category
        }
      });
    });
  } else {
    console.warn(categories ? 'Categories is empty' : 'Categories is null');
  }
  console.log('Returning categories');
  return [expense_categories, income_only_categories];
}

// Get all transactions
async function getTransactionsInAccounts(accountIds, startDate, endDate) {
  console.log(`Getting all transactions for ${accountIds}`);
  let allTransactions = {};

  for (const acct of accountIds) {
    let transactions = await api.getTransactions(acct, startDate, endDate);
    if (transactions.length > 0) {
      transactions.forEach(transaction => {
        allTransactions[transaction.id] = transaction;
      });
    }
  }

  console.log('Returning transactions');
  return allTransactions;
}

function filterNoCategory(transactions) {
  console.log("Filtering transactions without categories...");
  const nullCategoryTransactions = Object.fromEntries(
    Object.entries(transactions).filter(
      ([, transaction]) => transaction.category === null
    )
  );
  console.log("Filtered transactions without categories");
  return nullCategoryTransactions;
}

function filterWithCategory(transactions) {
  const withCategoryTransactions = Object.fromEntries(
    Object.entries(transactions).filter(
      ([, transaction]) => transaction.category !== null && transaction.category !== undefined
    )
  );
  return withCategoryTransactions;
}

function arrayToMarkdownTable(data) {
  // Extract headers from the first row
  const headers = Object.keys(data[0]);
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;

  // Generate table rows
  const rows = data.map(row => 
    `| ${headers.map(header => row[header]).join(' | ')} |`
  );

  // Combine everything
  return [headerRow, separatorRow, ...rows].join('\n');
}

function transactionsToTable(accounts, combinedCategories, transactions) {
  let transactionsTable = [];

  for (const transaction in transactions) {
    transactionsTable.push(
      {
        Account: accounts[transactions[transaction].account].name,
        Payee: transactions[transaction].imported_payee,
        Notes: transactions[transaction].notes,
        Amount: transactions[transaction].amount,
        Category: combinedCategories[transactions[transaction]?.category]?.name ?? "???"
      }
    );
  }
  return transactionsTable;
}


// Run bank sync
async function runBankSync() {
  console.log("Running bank sync...");
  await api.runBankSync();
  console.log("Bank sync completed");
}

// Schedule tasks
function scheduleBankSync() {
  // Schedule bank sync based on cron-style schedule
  console.log(`runBankSync scheduled for: ${bankSyncSchedule}`);
  cron.schedule(bankSyncSchedule, runBankSync);
}

async function categoriseTransactions() {
  try {
    // Get the latest from the server
    await downloadBudget();

    // ENHACEMENT: Would be nice to separate income categories in the future
    const [expenseCategories, incomeOnlyCategories] = await getCategories();
    combinedCategories = { ...expenseCategories, ...incomeOnlyCategories }

    // TO BE FIXED: This is probably going to be weird if you have mutliple categories with the same number under different sections...
    let expenseCategoryNames = [];
    for (category in combinedCategories) {
      expenseCategoryNames.push(combinedCategories[category].name);
    }
    console.log(`Expense categories: ${expenseCategoryNames}`);

    // Get all accounts
    let accounts = await getAllAccounts();
    console.log(`Returned all accounts ${Object.keys(accounts)}`);

    // Get transactions history for prompt
    const today = getFormattedDate();
    const historicalDaysForPrompt = getFormattedDate(parseInt(process.env.ACTUALGPT_HISTORICAL_DAYS_FOR_PROMPT, 10) || 0);
    let historicalTransactions = await getTransactionsInAccounts(Object.keys(accounts), historicalDaysForPrompt, today);

    historicalTransactions = filterWithCategory(historicalTransactions);
    historicalTransactionsTable = transactionsToTable(accounts, combinedCategories, historicalTransactions);

    // Now let's create the system prompt
    const filePath = path.join(__dirname, 'prompts', 'prompt.tmpl');
    let templateContents = fs.readFileSync(filePath,'utf8');
    // Replace categories available
    let joinedExpenseCategories = expenseCategoryNames
      .map(c => `'${c.replace(/'/g, "\\'")}'`)
      .join(', ');
    templateContents = templateContents.replace('{{Categories}}', joinedExpenseCategories);
    // Replace hsitorical transactions
    templateContents = templateContents.replace('{{HistoricalTransactions}}', arrayToMarkdownTable(historicalTransactionsTable));
    console.log(`System template for ChatGPT: ${templateContents}`);


    // Get all transactions that don't have a category
    const historicalDaysToCategorise = getFormattedDate(parseInt(process.env.ACTUALGPT_DAYS_TO_CATEGORISE, 10) || 0);
    console.log(`Gettings transactions to categorise from ${historicalDaysToCategorise} to ${today}`);
    let historicalTransactionsToCategorise = await getTransactionsInAccounts(Object.keys(accounts), historicalDaysToCategorise, today);
    let transactionsNoCategory = filterNoCategory(historicalTransactionsToCategorise);

    // Set the OpenAI model to use
    const openAiModel = process.env.OPENAI_MODEL || "gpt-4o";
    if (!process.env.OPENAI_MODEL) {
      console.warn("Warning: The OPENAI_MODEL environment variable is not set. Falling back to default model: gpt-4o.");
    }
    console.log(`Using OpenAI model: ${openAiModel}`);

    // Loop through all uncategorised transactions
    for (transaction in transactionsNoCategory) {
      let markdown = arrayToMarkdownTable(transactionsToTable(accounts, combinedCategories, [transactionsNoCategory[transaction]]));
      const messages = [
        { role: 'system', content: templateContents },
        { role: 'user', content: `What category does the following transaction fall into?\n${markdown}` },
      ];

      const response = await openAIClient.chat.completions.create({
        model: openAiModel,
        messages,
      });

      const category = response.choices[0].message.content.trim();
      // Also log the full request if unknown, for prompt improvement
      if (category === '###UNKNOWN###') {
        console.log(`Transaction NOT categorised - Account: "${accounts[transactionsNoCategory[transaction].account].name}" Payee: "${transactionsNoCategory[transaction].imported_payee}" Notes: "${transactionsNoCategory[transaction].notes}" Amount: "${transactionsNoCategory[transaction].amount}" -> Category: "${category}"`);
        if ((process.env.ACTUALGPT_DEBUG_PROMPTS || '').toLowerCase() === 'true') {
          console.log(messages);
        }
      } else {
        const foundCategoryId = findKeyByName(combinedCategories, category);
        console.log(`Transaction categorised by LLM - Id: "${transaction}" Account: "${accounts[transactionsNoCategory[transaction].account].name}" Payee: "${transactionsNoCategory[transaction].imported_payee}" Notes: "${transactionsNoCategory[transaction].notes}" Amount: "${transactionsNoCategory[transaction].amount}" -> Category: "${category}" (${foundCategoryId})`);
        // Put in the correct category
        console.log(foundCategoryId);
        console.log("Updating category on Actual...")
        await api.updateTransaction(transaction, { category: foundCategoryId });
        console.log("Updated category on Actual...")
      }
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
    if (error.stack) console.log(`Stack trace: ${error.stack}`);
    await shutdownAPI();
  }
}

// Schedule categorisation
function scheduleCategorisation() {
  // Schedule categorisation based on cron-style schedule
  console.log(`categoriseTransactions scheduled for: ${categoriseSchedule}`);
  cron.schedule(categoriseSchedule, categoriseTransactions);
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
  // Initialise everything
  await initialiseAPI();
  initialiseOpenAI();

  // Run categorisation on start up
  await categoriseTransactions();

  // Then schedule the categorisation
  scheduleCategorisation();

  console.log("Program is running...");

  // Listen for termination signals to shut down gracefully
  process.on('SIGINT', shutdownAPI);
  process.on('SIGTERM', shutdownAPI);
}

main();