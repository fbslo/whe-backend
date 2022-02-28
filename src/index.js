require('dotenv').config();
const assert = require('assert');
const schedule = require('node-schedule')
const winston = require('winston');

const database = require("./mongo.js")

const logger = winston.createLogger({
    level: 'error',
    transports: [
      new (winston.transports.File)({ filename: 'error.log' })
    ]
  })

const methods = ["mint", "transfer"]
assert(process.env.TOKEN_SYMBOL.length > 1, "TOKEN_SYMBOL length must be more than 1")
assert(process.env.HIVE_ACCOUNT.length > 1, "HIVE_ACCOUNT length must be more than 1")
assert(!process.env.HIVE_ACCOUNT.includes("@"), "HIVE_ACCOUNT should not include @")
assert(process.env.PERCENTAGE_DEPOSIT_FEE >= 0, "PERCENTAGE_DEPOSIT_FEE must be more or equal to 0")
assert(process.env.HIVE_TOKEN_PRECISION >= 0, "HIVE_TOKEN_PRECISION must be more or equal to 0")
assert(process.env.ETHEREUM_TOKEN_PRECISION >= 0, "ETHEREUM_TOKEN_PRECISION must be more or equal to 0")

const alreadyProcessed = []

async function main(){
  const hiveEngineDeposits = require("./libs/hive/scanHiveEngineTransactions.js");
  const processHiveEngineDeposit = require("./libs/hive/processHiveEngineDeposit.js");
  const mempool = require("./libs/hive/mempool.js")

  const scanEthereumTransactions = require("./libs/ethereum/scanEthereumTransactions.js")
  const processEthereumTransaction = require("./libs/ethereum/processEthereumTransaction.js")
  const sendEthereumTokens = require("./libs/ethereum/sendEthereumTokens.js")

  console.log("-".repeat(process.stdout.columns ? process.stdout.columns : 69))
  console.log(`Wrapped Hive Engine Oracle\nCopyright: @fbslo, 2022\n`)
  console.log(`Token Symbol: ${process.env.TOKEN_SYMBOL}\nHive account: ${process.env.HIVE_ACCOUNT}\nEthereum contract: ${process.env.ETHEREUM_CONTRACT_ADDRESS}`)
  console.log("-".repeat(process.stdout.columns ? process.stdout.columns : 69))

  //track new HE transactions
  hiveEngineDeposits.start((tx) => {
    processHiveEngineDeposit.start(tx)
      .then(async (result) => {
        if (result === 'deposit_refunded') console.log(`Invalid deposit transaction ${tx.transactionId} by ${tx.sender} refunded!`)
        else if (result === 'valid_deposit') {
          let payload = JSON.parse(tx.payload)
          console.log(`New HE deposit detected! ${payload.quantity} ${process.env.TOKEN_SYMBOL} sent by ${tx.sender}`)
          sendEthereumTokens.start(payload.quantity, payload.memo, tx.sender, logger, tx.transactionId)
        }
      })
      .catch((err) => {
        console.log(`[!] Error while processing HE deposit:`, err)
        logger.log('error', `Error while processing HE deposit: ${err}`)
      })
  })

  //check for new ERC20 deposits every minute
  schedule.scheduleJob('* * * * *', () => {
    scanEthereumTransactions.start((tx) => {
      processEthereumTransaction.start(tx)
        .then((result) => {
          if (!alreadyProcessed.includes(result.hash)){
            alreadyProcessed.push(result.hash) //prevent double spend
            processHiveEngineDeposit.transfer(result.username, result.amount, result.hash)
          }
        })
        .catch((err) => {
          console.log(`[!] Error while processing Ethereum transaction:`, err)
          logger.log('error', `Error while processing Ethereum transaction: ${err}`)
        })
    })
  })

  //highly experimental, don't use in production yet
  if (process.env.VERIFY_SECONDARY_NODE === 'true'){
    mempool.start(logger)
  }
}

database.connect()
  .then(async (db) => {
    const setup = require("./libs/setup/setup.js")
    let isFirstSetup = await setup.isFirstSetup()
    if (isFirstSetup) await setup.databaseSetup(db)
    main()
  })
  .catch((e) => console.error(e))
