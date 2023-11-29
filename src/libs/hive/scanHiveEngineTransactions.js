const { HiveEngine } = require("@splinterlands/hive-interface")
const hive_engine = new HiveEngine({
  rpc_url: process.env.HIVE_ENGINE_RPC || "https://api.hive-engine.com/rpc"
});

const axios = require('axios');

const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

let alreadyProcessed = []

function start(callback){
  try {
   hive_engine.stream(async (tx) => {
     let { transactionId, sender, contract, action, payload, logs } = tx
     payload = JSON.parse(payload)
     if (contract === "tokens" &&
         action === "transfer" &&
         payload.symbol === process.env.TOKEN_SYMBOL &&
         payload.to === process.env.HIVE_ACCOUNT
     ){
       let txHash = tx.transactionId.split("-")[0]
       if (!alreadyProcessed.includes(txHash)){
         alreadyProcessed.push(txHash)
         if (process.env.VERIFY_SECONDARY_NODE === 'true'){
           let isTransactionValid = await getSecondaryNodeInformation(transactionId, tx)
           if (isTransactionValid === 'transaction_valid') callback(tx)
         } else {
           callback(tx)
         }
       }
     }
   });
 } catch (e) {
   setTimeout(() => {
     start()
   }, 3000)
 }
}

function getSecondaryNodeInformation(transactionId, tx){
  return new Promise(async (resolve, reject) => {
    axios.post(process.env.HIVE_ENGINE_SECONDARY_ENDPOINT, {
      "jsonrpc": "2.0",
      "method": "getTransactionInfo",
      "params": {
        "txid": transactionId
      },
      "id": 1
    })
    .then(function (response) {
      if (response === null || response.data === null || response.data.result === null) {
        //add transaction to mempool
        let isAlreadyInMemPool = database.collection("mempool").findOne({ transactionId: transactionId })
        if (isAlreadyInMemPool.length === 0){
          database.collection("mempool").insertOne({ transactionId: transactionId, transaction: tx }, (err, result) => {
            if (err) console.log(err)
          })
          resolve("added_to_mempool")
        } else {
          resolve("already_in_mempool")
        }
      }
      else if (!response.data.result.logs.includes("errors")){
        resolve("transaction_valid")
      } else {
        reject("transaction_rejected")
      }
    })
    .catch(function (error) {
      reject(err)
    });
  })
}


module.exports.start = start
module.exports.getSecondaryNodeInformation = getSecondaryNodeInformation
