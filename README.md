# Actual-GPT

Welcome to Actual-GPT! This project is a ChatGPT add-on for [Actual Server](https://github.com/actualbudget/actual), designed to enhance your budgeting experience by automating two key tasks:

1. Transaction Categorization: Use ChatGPT to automatically categorize your transactions, saving you the time and effort of doing it manually.  
2. Scheduled Bank Syncs: Regularly sync your bank data to prevent token expiration and ensure your budget is always up-to-date.

I've developed it as a bit of a learning experience, but hope it will be useful for others.

## Table of Contents

- [Actual-GPT](#actual-gpt)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
  - [Finding Your Budget UUID](#finding-your-budget-uuid)
  - [Understanding Cron Expressions](#understanding-cron-expressions)
    - [ACTUALGPT\_BANK\_SYNC\_CRON](#actualgpt_bank_sync_cron)
    - [ACTUALGPT\_CATEGORISE\_CRON](#actualgpt_categorise_cron)
  - [Running the Application](#running-the-application)
    - [Using Docker Compose](#using-docker-compose)
    - [Without Docker](#without-docker)
  - [Customizing the Prompt Template](#customizing-the-prompt-template)
    - [Sample Prompt Template](#sample-prompt-template)
  - [Testing the Setup](#testing-the-setup)
  - [Troubleshooting](#troubleshooting)
  - [Security Considerations](#security-considerations)
  - [Contributing](#contributing)
  - [License](#license)

---

## Prerequisites

Before you begin, make sure you have the following:

- **Docker**: Installed and running on your system.  
- **Node.js**: Version 18 or later if you're running without Docker.  
- **Actual Server**: An instance of Actual Server running and accessible.  
- **OpenAI Account**: Sign up at OpenAI and obtain an API key.  
- **Budget UUID**: The unique identifier for your budget in Actual Server.  

---

## Installation

1. Clone the Repository:  
   Clone the repository and navigate to the directory:  
   `git clone https://github.com/ccrlawrence/actual-gpt.git`  
   `cd actual-gpt`  

2. Create the `.env` File:  
   Create a `.env` file in the root directory:  
   `touch .env`

3. Put the following in that file:
    ```
    NODE_ENV=development
    SERVER_URL=<your-actual-URL>
    SERVER_PASSWORD=<your-server-password>
    BUDGET_UUID=<your-budget-UUID>
    BUDGET_PASSWORD=<your-budget-password-if-applicable>
    OPENAI_API_KEY=<your-OpenAI-API-key-should-start-'sk-'>
    OPENAI_MODEL=chatgpt-4o-latest
    ACTUALGPT_BANK_SYNC_CRON="0 2 * * 3"
    ACTUALGPT_CATEGORISE_CRON="0 3 * * *"
    ACTUALGPT_HISTORICAL_DAYS_FOR_PROMPT=90
    ACTUALGPT_DAYS_TO_CATEGORISE=150
    ACTUALGPT_DEBUG_PROMPTS=true
    ```

---

## Configuration

### Environment Variables

Fill in the `.env` file with the following variables:

| Variable                          | Description                                                                 | Default Value        |
|-----------------------------------|-----------------------------------------------------------------------------|----------------------|
| NODE_ENV                          | Set the environment mode (development or production).                       | development          |
| SERVER_URL                        | The URL where your Actual Server is accessible (e.g., http://localhost:5006).|                      |
| SERVER_PASSWORD                   | The password you've set for your Actual Server.                             |                      |
| BUDGET_UUID                       | The unique identifier for your budget. See Finding Your Budget UUID for help.|                      |
| BUDGET_PASSWORD                   | If your budget is password-protected, provide the password here. Otherwise, leave it blank.| |
| OPENAI_API_KEY                    | Your OpenAI API key, obtainable from the OpenAI Dashboard.                  |                      |
| OPENAI_MODEL                      | The OpenAI model to use (e.g., chatgpt-4o-latest).                         | chatgpt-4o-latest    |
| ACTUALGPT_BANK_SYNC_CRON          | Cron schedule for bank syncs. Default is "0 2 * * 3" (every Wednesday at 2 AM).| "0 2 * * 3"         |
| ACTUALGPT_CATEGORISE_CRON         | Cron schedule for categorizing transactions. Default is "0 3 * * *" (daily).| "0 3 * * *"         |
| ACTUALGPT_HISTORICAL_DAYS_FOR_PROMPT | Number of days of historical transactions to include in prompts.           | 90                   |
| ACTUALGPT_DAYS_TO_CATEGORISE      | Days in the past to look for uncategorized transactions.                    | 150                  |
| ACTUALGPT_DEBUG_PROMPTS           | Set to true to enable debug logging of prompts sent to ChatGPT.             | true                 |

---

## Finding Your Budget UUID

1. Access Actual Server: Log in to your Actual Server instance.  
2. Navigate to Your Budget: Open the budget you want to use.  
3. Go to More -> Settings
4. Click 'Show advanced settings' at the bottom of the page
5. Your identified will be after 'Sync ID:' like `123e4567-e89b-12d3-a456-426614174000` 

---

## Understanding Cron Expressions

### ACTUALGPT_BANK_SYNC_CRON  
Controls how often the application syncs with your bank. The default "0 2 * * 3" means:  
- **Minute**: 0  
- **Hour**: 2 (2 AM)  
- **Day of Month**: * (every day)  
- **Month**: * (every month)  
- **Day of Week**: 3 (Wednesday)  

### ACTUALGPT_CATEGORISE_CRON  
Controls how often the application runs the transaction categorization. Default "0 3 * * *" means it runs daily at 3 AM.  

For customization, use tools like [crontab.guru](https://crontab.guru/).  

---

## Running the Application

### Using Docker Compose

1. Build and Run the Docker Container in detached mode:  
   `docker-compose up --buil -d`  

2. View Logs (Optional):  
   `docker-compose logs -f`  

3. If you are running this on the same machine as your Actual Server, you'll need to add some mutual networking.

### Without Docker

1. Install Dependencies:  
   `npm install`  

2. Start the Application:  
   `npm start`  

---

## Customizing the Prompt Template

The application uses a prompt template located at `prompts/prompt.tmpl` to interact with ChatGPT. You can customize this template to better suit your categorization needs.

### Sample Prompt Template

```
As a budgeting assistant, you categorize transactions based on the following categories: {{Categories}}.

Historical Transactions:  
{{HistoricalTransactions}}  

Please categorize the following transaction accordingly.
```

- `{{Categories}}` will be replaced with the list of categories from your Actual budget.  
- `{{HistoricalTransactions}}` will be replaced with a table of historical transactions to make it more accurate.  

---

## Testing the Setup

1. The categorisation will automatically run when first brought up.
2. The categorisation will then run as per your cron setting.
3. The bank sync will run as per your separate cron setting.

---

## Troubleshooting

- **OpenAI API Errors**:  
  Ensure your API key is correct and check OpenAI service status.  
- **Connection Issues**:  
  Verify `SERVER_URL` is accessible and Actual Server is running.  
- **Cron Jobs Not Running**:  
  Confirm cron expressions in `.env` file are correct.  

---

## Security Considerations

- Keep your `.env` file secure.  
- Do not commit sensitive information to version control.  
- Be cautious with data sent to OpenAI, and comply with applicable regulations.  
- Use strong, unique passwords for your services.  

---

## Contributing

We appreciate your interest in contributing! You can:  

- Report bugs via GitHub issues.  
- Suggest new features.  
- Submit pull requests with code contributions.  

Follow the existing code style and include documentation with changes.  

---

## License

This project is licensed under the MIT License. You're free to use, modify, and distribute this software.  

---

Happy budgeting!