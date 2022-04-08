const Web3 = require("web3")
const Tx = require('ethereumjs-tx').Transaction;
const { Hive } = require("@splinterlands/hive-interface")

const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_ENDPOINT));
const hive = new Hive({rpc_error_limit: 5}, {rpc_nodes: process.env.HIVE_RPC_NODES.split(',')});

const isAlreadyProcessed = []

function start(tx){
  return new Promise(async (resolve, reject) => {
    try {
      let { transactionId, sender, action, payload } = tx
      let isAlreadyInTheDatabase = await getTxFromDatabase(transactionId)
      payload = JSON.parse(payload)
      if (Number(payload.quantity) >= process.env.MIN_AMOUNT &&
          Number(payload.quantity) <= process.env.MAX_AMOUNT &&
          web3.utils.isAddress(payload.memo) &&
          !isAlreadyProcessed.includes(transactionId) &&
          !logs.includes("error") &&
          !isAlreadyInTheDatabase
      ){
        isAlreadyProcessed.push(transactionId)
        pushToDatabase(transactionId)
        resolve(`valid_deposit`)
      } else {
        if (!isAlreadyProcessed.includes(transactionId) && !isAlreadyInTheDatabase){
          isAlreadyProcessed.push(transactionId)
          pushToDatabase(transactionId)
          let transaction = await hive.transfer(
            process.env.HIVE_ACCOUNT,
            sender,
            payload.quantity + ' HBD',
            `Refund! Are you sure the amount is between ${process.env.MIN_AMOUNT} and ${process.env.MAX_AMOUNT} and memo is valid Ethereum address?`,
            process.env.HIVE_ACCOUNT_PRIVATE_KEY
          );
          resolve(`deposit_refunded`)
        }
      }
    } catch (e){
      reject(e)
    }
  })
}

function getTxFromDatabase(transactionId){
  return new Promise(async (resolve, reject) => {
    database.collection("hive_transactions").findOne({ transactionId: transactionId }, (err, result) => {
      if (err) reject(err)
      else if (result == undefined) resolve(false)
      else resolve(true)
    })
  })
}

function pushToDatabase(transactionId){
  database.collection("hive_transactions").findOne({ transactionId: transactionId }, (err, result) => {
    if (err) console.log(err)
  })
}

async function transfer(username, amount, hash){
  let transaction = await hive.transfer(
    process.env.HIVE_ACCOUNT,
    username,
    parseFloat(amount).toFixed(process.env.HIVE_TOKEN_PRECISION) + ' HBD',
    `${parseFloat(amount).toFixed(process.env.HIVE_TOKEN_PRECISION)} ${process.env.TOKEN_SYMBOL} converted! Transaction hash: ${hash}`,
    process.env.HIVE_ACCOUNT_PRIVATE_KEY
  );
}

module.exports.start = start
module.exports.transfer = transfer
