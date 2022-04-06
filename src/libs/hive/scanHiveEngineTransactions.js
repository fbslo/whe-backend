const { HiveEngine, Hive } = require("@splinterlands/hive-interface")
const hive = new Hive();

const axios = require('axios');

const mongo = require("../../mongo.js")
const database = mongo.get().db("oracle")

let alreadyProcessed = []

function start(callback){
  try {
    hive.stream({
      on_op: async (op, block_num, block_id, previous, transaction_id, block_time) => {
        let operation = op[0]
        let data = op[1]

        if (operation === "transfer" ){
          if (data.to == process.env.HIVE_ACCOUNT && data.amount.includes("HBD")){
            if (!alreadyProcessed.includes(transaction_id)){
              alreadyProcessed.push(transaction_id)
              let tx = {
                transactionId: transaction_id,
                sender: data.from,
                action: "transfer",
                payload: {
                  quantity: data.amount.split(" ")[0],
                  memo: data.memo
                }
              }
              callback(tx)
            }
          }
        }
      },
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
